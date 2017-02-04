// WARNING, this is OGG Vorbis and OGG Opus
// Most of the stuff here is not trivial and trying to understand is beyond human.
// There might also be lot of dead code here, so don't wonder.
// Abandon all hope, ye who enter here.

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
	// For vorbis I do not recommend to change this, EVER!
	this.WindowSize = 2;
	
	
	// Internal variables:
	// ===================
	
	// Stores the complete vorbis/opus header
	this.FullVorbisHeader = new Uint8Array(0);
	this.HeaderComplete = false;
	this.IsOpus = false;
	this.IsVorbis = false;
		
	// Data buffer for "raw" pagedata
	this.DataBuffer = new Uint8Array(0);
	
	// Array for individual pages
	this.Pages = new Array();
	
	// Array for individual bunches of samples
	this.Samples = new Array();
	
	// Page related variables
	this.PageStartIdx = -1;
	this.PageEndIdx = -1;
	this.ContinuingPage = false;
	this.MightBeHeader = false;
	this.LastAGPosition = 0;
	this.PageSampleLength = 0;
	
	
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

	this.isDecoding = false;

	this.DecodeQueue = new Array();
	
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
				// To compensate for that, we decode 3 segments together, 
				// but only use the samples from the middle one.
				// This adds a delay of [segment length] samples to the stream.
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
				
				// Check if last pushed page is not a continuing page
				if (Self.Pages[Self.Pages.length - 1]["continuing"] === false && Self.Pages.length >= Self.WindowSize)
				{
					// Sum the bytelengths of the individuall pages, also store individual samplelengths in array
					var bufferlength = 0;
					var sample_lengths = new Array();
					for (var i = 0; i < Self.Pages.length; i++)
					{
						bufferlength += Self.Pages[i]["data"].length;
						sample_lengths.push(Self.Pages[i]["samplelength"]);
					}
					
					// Create a buffer long enough to hold everything
					var pagesbuffer = new Uint8Array(Self.FullVorbisHeader.length + bufferlength);
					
					var offset = 0;
					
					// Add head to window
					pagesbuffer.set(Self.FullVorbisHeader, offset);
					offset += Self.FullVorbisHeader.length;
					
					// Add the pages to the window
					for (var i = 0; i < Self.Pages.length; i++)
					{
						pagesbuffer.set(Self.Pages[i]["data"], offset);
						offset += Self.Pages[i]["data"].length;
					}
					
					// Remove first page from the array
					Self.Pages.shift();

					if (Self.isDecoding)
					{
						Self.DecodeQueue.push({"data":pagesbuffer.buffer, "lengths": sample_lengths});
					}
					else
					{
						Self.isDecoding = true;
					
						// Push pages to the decoder
						Self.SoundContext.decodeAudioData(pagesbuffer.buffer, function (buffer) {
							decodeSuccess(buffer, sample_lengths);
						}, decodeError);
					}
				}
			}
			else
			{
				// Add page to header buffer
				Self.FullVorbisHeader = appendBuffer(Self.FullVorbisHeader, tmpPage["data"]);
			}
			// Look for pages
			FindPage ();
		}
	}

	function DecodeFromQueue ()
	{
		if (Self.DecodeQueue.length > 0)
		{
			Self.isDecoding = true;
			var sample_lengths = Self.DecodeQueue[0]["lengths"];
			var pagedata = Self.DecodeQueue[0]["data"];
			
			// Push pages to the decoder
			Self.SoundContext.decodeAudioData(pagedata, function (buffer) {
				decodeSuccess(buffer, sample_lengths);
			}, decodeError);
			Self.DecodeQueue.shift();
		}
	}

	// Is called if the decoding of the pages succeeded
	function decodeSuccess (buffer, sample_lengths)
	{
		// For opus we need to make some corrections due to the fixed overlapping
		if (Self.IsOpus)
		{
			// Calculate size of the part we are interested in		
			var partlength = Math.ceil((sample_lengths[sample_lengths.length - 1]) * buffer.sampleRate / 48000);

			// Create a buffer that can hold the part
			var audioBuffer = Self.SoundContext.createBuffer(buffer.numberOfChannels, partlength, buffer.sampleRate);
			
			// Fill buffer with the last part of the decoded pages
			for (var i = 0; i < buffer.numberOfChannels; i++)
				audioBuffer.getChannelData(i).set(buffer.getChannelData(i).subarray(buffer.length-partlength, buffer.length));
				
			// Push samples into arrray
			Self.Samples.push(audioBuffer);
		}
		else
		{
			// Push samples into arrray
			Self.Samples.push(buffer);
		}		
		
		// Callback to tell that data is ready
		Self.DataReadyCallback();

		// Check if there was data to decode meanwhile
		Self.isDecoding = false;
		DecodeFromQueue ();
	}
	
	// Is called in case the decoding of the pages fails
	function decodeError ()
	{
		Self.ErrorCallback();
		Self.isDecoding = false;
		DecodeFromQueue ();
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
				// Get header data
				
				var absolute_granule_position = Self.DataBuffer[Self.PageStartIdx + 6] | Self.DataBuffer[Self.PageStartIdx + 7] << 8 | Self.DataBuffer[Self.PageStartIdx + 8] << 16 | Self.DataBuffer[Self.PageStartIdx + 9] << 24 |
										Self.DataBuffer[Self.PageStartIdx + 10] << 32 | Self.DataBuffer[Self.PageStartIdx + 11] << 40 | Self.DataBuffer[Self.PageStartIdx + 12] << 48 | Self.DataBuffer[Self.PageStartIdx + 13] << 56;
				
				var page_segments    = Self.DataBuffer[Self.PageStartIdx + 26];
				
				Self.IsHeader = false;
							
				// Get length of page in samples
				if (Self.LastAGPosition > 0)
					Self.PageSampleLength = absolute_granule_position - Self.LastAGPosition;
				else
					Self.PageSampleLength = 0;

				// Store total sample length if AGP is not -1
				if (absolute_granule_position !== 0xFFFFFFFFFFFFFFFF)
					Self.LastAGPosition = absolute_granule_position;
				
				// Check if page is a header candidate
				if (absolute_granule_position === 0x0000000000000000)
				{
					var content_start = Self.PageStartIdx + 27 + page_segments;
		
					// Check if magic number of headers match

					if ((content_start + 3) < Self.DataBuffer.length)
					{
						if	(Self.DataBuffer[content_start] == 0x4F && Self.DataBuffer[content_start+1] == 0x70 && // 'Opus'
							Self.DataBuffer[content_start+2] == 0x75 && Self.DataBuffer[content_start+3] == 0x73)
						{
							Self.IsHeader = true;
							Self.IsOpus = true;
						}
						else if ((content_start + 6) < Self.DataBuffer.length)
						{
							if (Self.DataBuffer[content_start+1] == 0x76 && Self.DataBuffer[content_start+2] == 0x6f && Self.DataBuffer[content_start+3] == 0x72 &&  // 'vorbis'
								Self.DataBuffer[content_start+4] == 0x62 && Self.DataBuffer[content_start+5] == 0x69 && Self.DataBuffer[content_start+6] == 0x73)
							{
								Self.IsHeader = true;
								Self.IsVorbis = true;
							}
						}
					}
				}

				// Check if we have enough data to process the segment table
				if ((Self.PageStartIdx + 26 + page_segments) < Self.DataBuffer.length)
				{
					// Sum up segments of the segment table
					var total_segments_size = 0;
					for (var i = 0; i < page_segments; i++)
					{
						total_segments_size += Self.DataBuffer[Self.PageStartIdx + 27 + i];
					}
					
					// Check if a package in the page will be continued in the next page
					Self.ContinuingPage   = Self.DataBuffer[Self.PageStartIdx + 26 + page_segments] == 0xFF;
					if (Self.ContinuingPage)
						console.log("Continued ogg page found, check encoder settings.");				

					// Set end page boundry
					Self.PageEndIdx = Self.PageStartIdx + 27 + page_segments + total_segments_size;
				}
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
		
		return {"data": pagearray, "continuing": Self.ContinuingPage, "samplelength": Self.PageSampleLength};
	}
}

// Used to append two Uint8Array (buffer2 comes BEHIND buffer1)
function appendBuffer (buffer1, buffer2)
{
	var tmp = new Uint8Array(buffer1.length + buffer2.length);
	tmp.set(buffer1, 0);
	tmp.set(buffer2, buffer1.length);
	return tmp;
}
