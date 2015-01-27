function AudioFormatReader_OGG (ErrorCallback, DataReadyCallback)
{
	// Used to reference the current instance of this class within callback functions and methods
	var Self = this;
	
	
	// Dependencies:
	// =============
	
	// Check callback argument
	if (typeof ErrorCallback !== 'function')
		throw new Error('AudioFormatReader_OGG: ErrorCallback must be specified');
	if (typeof DataReadyCallback !== 'function')
		throw new Error('AudioFormatReader_OGG: DataReadyCallback must be specified');
	
	this.ErrorCallback = ErrorCallback;
	this.DataReadyCallback = DataReadyCallback;
	
	// Create audio context
	if (typeof AudioContext !== "undefined")
		this.SoundContext = new AudioContext();
	else if (typeof webkitAudioContext !== "undefined")
		this.SoundContext = new webkitAudioContext();	
	else if (typeof mozAudioContext !== "undefined")
		this.SoundContext = new mozAudioContext();
	else
		throw new Error('AudioFormatReader_OGG: Browser does not support "AudioContext".');
	
	
	// Constants:
	// ==========
	
	// Number of pages to decode together
	// For live streaming this means that you should push the same number of pages
    // on connection to the client to reduce waiting time
	this.DecodePageNum = 4;
	// Number of pages to actually use after decoding
	this.DecodePageUse = 4;
	
	// Internal variables:
	// ===================
	
	// Stores the complete opus/vorbis header
	this.FullHeader = new Uint8Array(0);
		
	// Data buffer for "raw" pagedata
	this.DataBuffer = new Uint8Array(0);
	
	// Array for individual pages
	this.Pages = new Array();
	
	// Array for individual bunches of samples
	this.Samples = new Array();
	
	// Indices that mark page borders3
	this.PageStartIdx = -1;
	this.PageEndIdx = -1;
	this.Segments = new Array();
	this.ContinuingPage = false;
	this.IsHeader = false;
	this.LastAGPosition = 0;
	this.PageSampleLength = 0;
	
	// Codec related information
	this.SampleRate = 0;
	this.IsVorbis = false;
	this.IsOpus = false;
	
	// Methods (external functions):
	// =============================
	
	// Pushes page data into the buffer
	this.PushData = PushData;
	function PushData (data)
	{
		// Append data to pagedata buffer
		Self.DataBuffer = appendBuffer(Self.DataBuffer, new Uint8Array(data));
		// Try to extract pages
		ExtractAllPages ();
	}
	
	// Check if there are any samples ready for playback
	this.SamplesAvailable = SamplesAvailable;
	function SamplesAvailable ()
	{
		return (Self.Samples.length > 0);
	}
	
	// Returns a bunch of samples for playback and removes the from the array
	this.PopSamples = PopSamples;
	function PopSamples ()
	{
		if (Self.Samples.length > 0)
		{
			// Get first bunch of samples
			var audioBuffer = Self.Samples[0];
			// Remove said bunch from the array
			Self.Samples.shift();
			// Hand it back to callee
			return audioBuffer;
		}
		else
			return null;
	}

	// Used to force page extraction externaly
	this.Poke = Poke;
	function Poke ()
	{
		ExtractAllPages ();
	}
	
	// Deletes all pages from the databuffer and page array and all samples from the samplearray
	this.PurgeData = PurgeData;
	function PurgeData ()
	{
		Self.DataBuffer = new Uint8Array(0);
		
		Self.Pages = new Array();
		Self.Samples = new Array();
		
		Self.PageStartIdx = -1;
		Self.PageEndIdx = -1;
	}
	
	
	// Internal functions:
	// ===================
	
	// Extracts all currently possible pages
	function ExtractAllPages ()
	{
		// Look for pages
		FindPage ();
		// Repeat as long as we can extract pages
		while(CanExtractPage())
		{
			// Extract page
			var tmpPage = ExtractPage();
			
			// Check if we look at a header
			if (!Self.IsHeader)
			{
				// Push page into array
				Self.Pages.push(tmpPage);
				
				// Note:
				// =====
				// Vorbis and Opus have an overlapping between segments.
				// To decode we have to push at least two pages into the decoder.
				// This adds a delay of [segment length] / 2 samples to the stream.
				// The segment length can be up to 8192 samples for Vorbis (!) (170ms @ 48kHz)
				
				// TODO: Depending on if Opus or Vorbis is used, minimize the number of unused samples
				//       by using the segment length in the ogg header (for vorbis)
				//       or by using a fixed offset (for opus)
				//       See these documents for reference:
				//       - Vorbis overlap: http://www.xiph.org/vorbis/doc/Vorbis_I_spec.pdf
				//                         On Page 11
				//       - Opus overlap:   http://jmvalin.ca/slides/opus_celt_aes135.pdf
				//                         On Page 6 (for CELT)
				//                         Find some source if SILK has an overlap aswell...
				//                         (Maybe here: www.opus-codec.org/docs/draft-ietf-codec-opus-00.html ??)
				
				// Check if we have enough pages together
				if (Self.Pages.length >= Self.DecodePageNum)
				{
					console.log("decode push");
					// Sum the lengths of the individuall pages
					var bufferlength = 0;
					for (var i = 0; i < Self.Pages.length; i++)
						bufferlength += Self.Pages[i]["data"].length;
					
					// Create a buffer long enough to hold everything
					var pagesbuffer = new Uint8Array(Self.FullHeader.length + bufferlength);
					
					var offset = 0;
					
					// Add head to window
					pagesbuffer.set(Self.FullHeader, offset);
					offset += Self.FullHeader.length;
					
					// Add the pages to the window
					for (var i = 0; i < Self.Pages.length; i++)
					{
						pagesbuffer.set(Self.Pages[i]["data"], offset);
						offset += Self.Pages[i]["data"].length;
					}
					
					// Get window lengths
					var samplellengths = new Array();
					
					for (var i = 0; i < Self.Pages.length; i++)
					{
						samplellengths.push(Self.Pages[i]["samplellength"]);
					}
					
					// Remove first page from the array
					for (var i = 1; i < Self.DecodePageUse; i++)
						Self.Pages.shift();
					
					// Push pages to the decoder
					Self.SoundContext.decodeAudioData(pagesbuffer.buffer, function (buffer)
					{
						var samplellengths_ = samplellengths;
						decodeSuccess(buffer, samplellengths_);
					}, decodeError);
				}
			}
			else
			{
				// Add page to header buffer
				Self.FullHeader = appendBuffer(Self.FullHeader, tmpPage["data"]);
				if (Self.IsVorbis)
					ParseVorbisHeader(tmpPage["data"]);
				
				console.log("head push");
			}
			// Look for pages
			FindPage ();
		}
	}

	// Is called if the decoding of the pages succeeded
	function decodeSuccess (buffer, samplellengths)
	{
		if (Self.DecodePageNum != Self.DecodePageUse)
		{
			// Calucate the size of the samples we want to use
			var UsedPagesSize = 0;
			for (var i = (Self.DecodePageNum - Self.DecodePageUse + 1); i < samplellengths.length; i++)
			{
				UsedPagesSize += samplellengths[i];
			}
			
			// Build buffer and fill it with the samples to use
			var audioBuffer = Self.SoundContext.createBuffer(buffer.numberOfChannels, UsedPagesSize, buffer.sampleRate);
			for (var i = 0; i < buffer.numberOfChannels; i++)
				audioBuffer.getChannelData(i).set(buffer.getChannelData(i).subarray(buffer.length-UsedPagesSize, buffer.length));
			
			// Push samples into array
			Self.Samples.push(audioBuffer);
		}
		else			
			Self.Samples.push(buffer);
		
		// Callback to tell that data is ready
		Self.DataReadyCallback();
	}
	
	// Is called in case the decoding of the pages fails
	function decodeError ()
	{
		Self.ErrorCallback();
	}
	
	// Finds page boundries within the data buffer
	function FindPage ()
	{	
		// Find page start
		if (Self.PageStartIdx < 0)
		{
			var i = 0;
			// Make sure we don't exceed array bounds
			while ((i + 3) < Self.DataBuffer.length)
			{
				// Look for the ogg capture pattern
				if (Self.DataBuffer[i] == 0x4f && Self.DataBuffer[i + 1] == 0x67 && Self.DataBuffer[i + 2] == 0x67 && Self.DataBuffer[i + 3] == 0x53)
				{
					// Capture pattern found, set page start
					Self.PageStartIdx = i;
					break;
				}
				i++;
			}
		}
		
		// Find page end
		if (Self.PageStartIdx >= 0 && Self.PageEndIdx < 0)
		{
			// Check if we have enough data to process the static part of the header
			if ((Self.PageStartIdx + 26) < Self.DataBuffer.length)
			{
				
				Self.IsHeader = false;
				// Get header data
				
				//var header_type_flag = Self.DataBuffer[Self.PageStartIdx + 5];

				var absolute_granule_position = Self.DataBuffer[Self.PageStartIdx + 6] | Self.DataBuffer[Self.PageStartIdx + 7] << 8 |
										Self.DataBuffer[Self.PageStartIdx + 8] << 16 | Self.DataBuffer[Self.PageStartIdx + 9] << 24 |
										Self.DataBuffer[Self.PageStartIdx + 10] << 32 | Self.DataBuffer[Self.PageStartIdx + 11] << 40 |
										Self.DataBuffer[Self.PageStartIdx + 12] << 48 | Self.DataBuffer[Self.PageStartIdx + 13] << 56;
				
				var page_segments    = Self.DataBuffer[Self.PageStartIdx + 26];
				
				// Check if page is a header page candidate
				var IsHeaderCandidate   = (absolute_granule_position === 0x0000000000000000);
				
				if(Self.LastAGPosition === 0 && absolute_granule_position !== 0xFFFFFFFFFFFFFFFF)
					Self.LastAGPosition = absolute_granule_position;
				
				// Get length of page in samples
				Self.PageSampleLength = absolute_granule_position - Self.LastAGPosition;

				if (Self.PageSampleLength > 6000)
					console.log(Self.LastAGPosition);
				
				// Store total sample length if AGP is not -1
				if (absolute_granule_position !== 0xFFFFFFFFFFFFFFFF)
					Self.LastAGPosition = absolute_granule_position;
				
				// Check if we have enough data to process the segment table
				if ((Self.PageStartIdx + 26 + page_segments) < Self.DataBuffer.length)
				{
					// Sum up segments of the segment table
					Self.Segments = new Array();
					
					var segments_size = 0;
					var total_segments_size = 0;
					for (var i = 0; i < page_segments; i++)
					{
						total_segments_size += Self.DataBuffer[Self.PageStartIdx + 27 + i];
						segments_size += Self.DataBuffer[Self.PageStartIdx + 27 + i];
						if (Self.DataBuffer[Self.PageStartIdx + 27 + i] < 0xFF)
						{
							Self.Segments.push(segments_size);
							segments_size = 0;
						}
					}
					
					// Check if a package in the page will be continued in the next page
					Self.ContinuingPage   = (Self.DataBuffer[Self.PageStartIdx + 26 + page_segments] == 0xFF);
					
					// Set end page boundry
					Self.PageEndIdx = Self.PageStartIdx + 27 + page_segments + total_segments_size;
				}
				
				if (IsHeaderCandidate && (Self.PageStartIdx + 26 + page_segments + 4) < Self.DataBuffer.length)
				{
					Self.IsHeader = (Self.DataBuffer[Self.PageStartIdx + 26 + page_segments + 1] == 0x4f && Self.DataBuffer[Self.PageStartIdx + 26 + page_segments + 2] == 0x70 && // "Opus"
									Self.DataBuffer[Self.PageStartIdx + 26 + page_segments + 3] == 0x75 &&	Self.DataBuffer[Self.PageStartIdx + 26 + page_segments + 4] == 0x73);
					if (Self.IsHeader)
						Self.IsOpus = true;
				}
				
				if (!Self.IsHeader)
				{
					if (IsHeaderCandidate && (Self.PageStartIdx + 26 + page_segments + 7) < Self.DataBuffer.length)
					{
						Self.IsHeader = (Self.DataBuffer[Self.PageStartIdx + 26 + page_segments + 2] == 0x76 && Self.DataBuffer[Self.PageStartIdx + 26 + page_segments + 3] == 0x6f && // "vorbis"
										Self.DataBuffer[Self.PageStartIdx + 26 + page_segments + 4] == 0x72 &&	Self.DataBuffer[Self.PageStartIdx + 26 + page_segments + 5] == 0x62 &&
										Self.DataBuffer[Self.PageStartIdx + 26 + page_segments + 6] == 0x69 && Self.DataBuffer[Self.PageStartIdx + 26 + page_segments + 7] == 0x73);
						if (Self.IsHeader)
							Self.IsVorbis = true;
					}
					else
						Self.IsHeader = false;
				}
			}
		}
	}

	function ParseVorbisHeader (data)
	{
		var position = 0;
		
		// Skip ogg header
		position += 26;
		var page_segments    = data[position];
		position += 1;
		position += page_segments;
		
		while (position < data.length)
		{
			// Read packet type, skip packet header
			var packet_type    = data[position];
			position += 7;
			
			switch (packet_type)
			{
				case 1: // Identification header
					// Skip vorbis verion and audio channels, read samplerate
					position += 5;
					Self.SampleRate = data[position] | data[position + 1] << 8 | data[position + 2] << 16 | data[position + 3] << 24;
					position += 4;
					// Skip bitrates, read blocksizes, skip framing flag
					position += 12;
					//Self.Blocksize0 = Math.pow(2, data[position] & 0x0F);
					//Self.Blocksize1 = Math.pow(2, (data[position] & 0xF0) >>> 4);
					
					position += 2;
					return;
				case 3: // Comment header
					// Read vendor length
					var vendor_length = data[position] | data[position + 1] << 8 | data[position + 2] << 16 | data[position + 3] << 24;
					position += 4;
					// Skip vendor string
					position += vendor_length;
					// Reader user comment list length
					var user_comment_list_length = data[position] | data[position + 1] << 8 | data[position + 2] << 16 | data[position + 3] << 24;
					position += 4;
					// Iterate the user comment list
					for (var i = 0; i < user_comment_list_length; i++)
					{
						// Reader comment length
						var comment_length = data[position] | data[position + 1] << 8 | data[position + 2] << 16 | data[position + 3] << 24;
						position += 4;
						// Skip comment
						position += comment_length;
					}
					// Skip framing flag
					position += 1;
					break;
				case 5: // Setup header
					// Goto end of header
					position = data.length - 1;
					return;
				default:
					console.log("packet_type missmatch:", packet_type);
					break;
			}
		}
	}
	
	// Checks if there is a page ready to be extracted
	function CanExtractPage ()
	{
		if (Self.PageStartIdx < 0 || Self.PageEndIdx < 0)
			return false;
		else if (Self.PageEndIdx < Self.DataBuffer.length)
			return true;
		else
			return false;
	}

	// Extract a single page from the buffer
	function ExtractPage()
	{
		// Extract page data from buffer
		var pagearray = new Uint8Array(Self.DataBuffer.buffer.slice(Self.PageStartIdx, Self.PageEndIdx));
		
		// Remove page from buffer
		if ((Self.PageEndIdx + 1) < Self.DataBuffer.length)
			Self.DataBuffer = new Uint8Array(Self.DataBuffer.buffer.slice(Self.PageEndIdx));
		else
			Self.DataBuffer = new Uint8Array(0);
		
		// Reset Start/End indices
		Self.PageStartIdx = 0;
		Self.PageEndIdx = -1;
		
		return {"data": pagearray, "continuing": Self.ContinuingPage, "samplellength": Self.PageSampleLength, "segments": Self.Segments};
	}
}

function ilog (x)
{
	var return_value = 0;
	while(x > 0)
	{
		return_value++;
		x = x >>> 1;
	}
	return return_value;
}

// Used to append two Uint8Array (buffer2 comes BEHIND buffer1)
function appendBuffer (buffer1, buffer2)
{
	var tmp = new Uint8Array(buffer1.length + buffer2.length);
	tmp.set(buffer1, 0);
	tmp.set(buffer2, buffer1.length);
	return tmp;
}
