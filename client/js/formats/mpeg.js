/*
	MPEG-Audio-Format-Reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/
function AudioFormatReader_MPEG (ErrorCallback, DataReadyCallback)
{
	// Used to reference the current instance of this class within callback functions and methods
	var Self = this;
	
	// Dependencies:
	// =============
	
	// Check callback argument
	if (typeof ErrorCallback !== 'function')
		throw new Error('AudioFormatReader_MPEG: ErrorCallback must be specified');
	if (typeof DataReadyCallback !== 'function')
		throw new Error('AudioFormatReader_MPEG: DataReadyCallback must be specified');
	
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
		throw new Error('AudioFormatReader_MPEG: Browser does not support "AudioContext".');
	
	
	// Settings:
	// =========
	
	// Adds a minimal ID3v2 tag to each frame
	this.AddID3Tag = true;
	
	// Number of frames to decode together (keyword: byte-reservoir)
	// For live streaming this means that you should push the same number of frames
	// on connection to the client to reduce waiting time (latency is NOT effected by this)
	if (isAndroid && isFirefox)
		this.WindowSize = 50;
	else if (isAndroid && isNativeChrome)
		this.WindowSize = 30;
	else if (isAndroid)
		this.WindowSize = 30;
	else
		this.WindowSize = 25;
	
	// Number of frames to use from one decoded window
	if (isAndroid && isFirefox)
		this.UseFrames = 40;
	else if (isAndroid && isNativeChrome)
		this.UseFrames = 20;
	else if (isAndroid)
		this.UseFrames = 5;
	else
		this.UseFrames = 1;
	
	if (isAndroid && isNativeChrome)
		this.OffsetRightFactor = 1.5;
	else
		this.OffsetRightFactor = 1;	
	
	// Constants:
	// ==========
	
	// MPEG versions - use [version]
	this.mpeg_versions = new Array( 25, 0, 2, 1 );

	// Layers - use [layer]
	this.mpeg_layers = new Array( 0, 3, 2, 1 );

	// Bitrates - use [version][layer][bitrate]
	this.mpeg_bitrates = new Array(
		new Array( // Version 2.5
			new Array( 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 0 ), // Reserved
			new Array( 0,   8,  16,  24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160, 0 ), // Layer 3
			new Array( 0,   8,  16,  24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160, 0 ), // Layer 2
			new Array( 0,  32,  48,  56,  64,  80,  96, 112, 128, 144, 160, 176, 192, 224, 256, 0 )  // Layer 1
		),
		new Array( // Reserved
			new Array( 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 0 ), // Invalid
			new Array( 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 0 ), // Invalid
			new Array( 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 0 ), // Invalid
			new Array( 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 0 )  // Invalid
		),
		new Array( // Version 2
			new Array( 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 0 ), // Reserved
			new Array( 0,   8,  16,  24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160, 0 ), // Layer 3
			new Array( 0,   8,  16,  24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160, 0 ), // Layer 2
			new Array( 0,  32,  48,  56,  64,  80,  96, 112, 128, 144, 160, 176, 192, 224, 256, 0 )  // Layer 1
		),
		new Array( // Version 1
			new Array( 0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 0 ), // Reserved
			new Array( 0,  32,  40,  48,  56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320, 0 ), // Layer 3
			new Array( 0,  32,  48,  56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320, 384, 0 ), // Layer 2
			new Array( 0,  32,  64,  96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0 ) // Layer 1
		)
	);

	// Sample rates - use [version][srate]
	this.mpeg_srates = new Array(
		new Array( 11025, 12000,  8000, 0 ), // MPEG 2.5
		new Array(     0,     0,     0, 0 ), // Reserved
		new Array( 22050, 24000, 16000, 0 ), // MPEG 2
		new Array( 44100, 48000, 32000, 0 )  // MPEG 1
	);

	// Samples per frame - use [version][layer]
	this.mpeg_frame_samples = new Array(
	//             Rsvd     3     2     1  < Layer  v Version
		new Array(    0,  576, 1152,  384 ), //       2.5
		new Array(    0,    0,    0,    0 ), //       Reserved
		new Array(    0,  576, 1152,  384 ), //       2
		new Array(    0, 1152, 1152,  384 )  //       1
	);

	// Slot size (MPEG unit of measurement) - use [layer]
	this.mpeg_slot_size = new Array( 0, 1, 1, 4 ); // Rsvd, 3, 2, 1
	
	// Minimalistic ID3v2 tag
	if (this.AddID3Tag)
	{
		Self.ID3v2Tag = new Uint8Array(new Array(
			0x49, 0x44, 0x33,       // File identifier: "ID3"
			0x03, 0x00,             // Version 2.3
			0x00,                   // Flags: no unsynchronisation, no extended header, no experimental indicator
			0x00, 0x00, 0x00, 0x0D, // Size of the (tag-)frames, extended header and padding
			0x54, 0x49, 0x54, 0x32, // Title frame: "TIT2"
			0x00, 0x00, 0x00, 0x02, // Size of the frame data
			0x00, 0x00,				// Frame Flags
			0x00, 0x20, 0x00		// Frame data (space character) and padding 
		));
	}
	
	
	// Internal variables:
	// ===================
	
	// Data buffer for "raw" framedata
	this.DataBuffer = new Uint8Array(0);
	
	// Array for individual frames
	this.Frames = new Array();
	
	// Array for individual bunches of samples
	this.Samples = new Array();
	
	// Indices that mark frame borders
	this.FrameStartIdx = -1;
	this.FrameEndIdx = -1;
	
	this.FrameSamples = 0;
	this.FrameSampleRate = 0;
	

	// Methods (external functions):
	// =============================
	
	// Pushes frame data into the buffer
	this.PushData = PushData;
	function PushData (data)
	{
		// Append data to framedata buffer
		Self.DataBuffer = appendBuffer(Self.DataBuffer, new Uint8Array(data));
		// Try to extract frames
		ExtractAllFrames ();
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

	// Used to force frame extraction externaly
	this.Poke = Poke;
	function Poke ()
	{
		ExtractAllFrames ();
	}
	
	// Deletes all frames from the databuffer and framearray and all samples from the samplearray
	this.PurgeData = PurgeData;
	function PurgeData ()
	{
		Self.DataBuffer = new Uint8Array(0);
		
		Self.Frames = new Array();
		
		Self.Samples = new Array();
		
		Self.FrameStartIdx = -1;
		Self.FrameEndIdx = -1;
	}
	
	
	// Internal functions:
	// ===================
	
	// Extracts all currently possible frames
	function ExtractAllFrames ()
	{
		// Look for frames
		FindFrame ();
		// Repeat as long as we can extract frames
		while(CanExtractFrame())
		{
			// Extract frame and push into array
			Self.Frames.push(ExtractFrame());
			
			// Check if we have enough frames to decode
			if (Self.Frames.length >= Self.WindowSize)
			{
				var SampleRates = new Array();
				var SampleCount = new Array();
				
				// Sum the lengths of the individuall frames
				var bufferlength = 0;
				for (var i = 0; i < Self.WindowSize; i++)
				{
					SampleRates.push(Self.Frames[i].rate);
					SampleCount.push(Self.Frames[i].samples);
					bufferlength += Self.Frames[i].data.length;
				}
				
				// If needed, add some space for the ID3v2 tag
				if (Self.AddID3Tag)
					bufferlength += Self.ID3v2Tag.length;
				
				// Create a buffer long enough to hold everything
				var windowbuffer = new Uint8Array(bufferlength);

				var offset = 0;
				
				// If needed, add ID3v2 tag to beginning of buffer
				if (Self.AddID3Tag)
				{
					windowbuffer.set(Self.ID3v2Tag, offset);
					offset += Self.ID3v2Tag.length;
				}
				
				// Add the frames to the window
				for (var i = 0; i < Self.WindowSize; i++)
				{
					windowbuffer.set(Self.Frames[i].data, offset);
					offset += Self.Frames[i].data.length;
				}
				
				// Remove the first frame of the array
				for(var i = 0; i < Self.UseFrames; i++)
					Self.Frames.shift();
				
				// Push window to the decoder
				Self.SoundContext.decodeAudioData(
					windowbuffer.buffer,							  
					function(buffer)
					{
						var srates = SampleRates;
						var scount = SampleCount;
						decodeSuccess(buffer, srates, scount);
					},
					decodeError);
			}
			
			// Look for frames
			FindFrame ();
		}
	}

	// Is called if the decoding of the window succeeded
	function decodeSuccess (buffer, SampleRates, SampleCount)
	{
		// Get sample rate from first frame
		var CalcSampleRate = SampleRates[0];
		
		// Sum up the sample count of each decoded frame
		var CalcSampleCount = 0;
		for (var i = 0; i < SampleCount.length; i++)
			CalcSampleCount += SampleCount[i];
		
		// Calculate the expected number of samples
		CalcSampleCount = Math.ceil(CalcSampleCount * buffer.sampleRate / CalcSampleRate);
		
		//console.log(CalcSampleCount, buffer.length);
		
		var DecoderOffset;
		
		// Check if we got the expected number of samples
		if (CalcSampleCount > buffer.length)
		{
			// We got less samples than expect, we suspect that they were truncated equally at start and end.
			DecoderOffset = Math.ceil((CalcSampleCount - buffer.length) / 2)
		}
		else if (CalcSampleCount < buffer.length)
		{
			// We got more samples than expect, we suspect that they were added equally at start and end.
			DecoderOffset = -1 * Math.ceil((buffer.length - CalcSampleCount) / 2)
		}
		else
		{
			// We got the expected number of samples, no adaption needed
			DecoderOffset = 0;
		}
		
		// Note:
		// =====
		//	mp3 frames have an overlap of [granule size] so we can't use the first or last [granule size] samples
		// [granule size] is equal to half of a [frame size] in samples (using the mp3's sample rate)
		
		// Calculate the size and offset of the frame to extract
		var OffsetRight = Math.ceil(Math.ceil(SampleCount[SampleCount.length - 1] / 2 * buffer.sampleRate / CalcSampleRate) * Self.OffsetRightFactor);

		var ExtractSize = 0;
		for(var i = 0; i < Self.UseFrames; i++)
			ExtractSize += SampleCount[SampleCount.length - 2 - i];
		
		ExtractSize = Math.ceil(ExtractSize * buffer.sampleRate / CalcSampleRate);

		// Create a buffer that can hold the frame to extract
		var audioBuffer = Self.SoundContext.createBuffer(buffer.numberOfChannels, ExtractSize, buffer.sampleRate);

		// Fill buffer with the last part of the decoded frame leave out last granule
		for (var i = 0; i < buffer.numberOfChannels; i++)
			audioBuffer.getChannelData(i).set(buffer.getChannelData(i).subarray(
				buffer.length - OffsetRight + DecoderOffset - ExtractSize,
				buffer.length - OffsetRight + DecoderOffset
			));
		
		// Push samples into array
		
		Self.Samples.push(audioBuffer);		
		//Self.Samples.push(buffer);		

		// Callback to tell that data is ready
		Self.DataReadyCallback();
	}
	
	// Is called in case the decoding of the window fails
	function decodeError ()
	{
		Self.ErrorCallback();
	}
	
	// Finds frame boundries within the data buffer
	function FindFrame ()
	{	
		// Find frame start
		if (Self.FrameStartIdx < 0)
		{
			var i = 0;
			// Make sure we don't exceed array bounds
			while ((i + 1) < Self.DataBuffer.length)
			{
				// Look for MPEG sync word
				if (Self.DataBuffer[i] == 0xFF && (Self.DataBuffer[i + 1] & 0xE0) == 0xE0)
				{
					// Sync found, set frame start
					Self.FrameStartIdx = i;
					break;
				}
				i++;
			}
		}
		
		// Find frame end
		if (Self.FrameStartIdx >= 0 && Self.FrameEndIdx < 0)
		{
			// Check if we have enough data to process the header
			if ((Self.FrameStartIdx + 2) < Self.DataBuffer.length)
			{
				// Get header data
				
				// Version index
				var ver = (Self.DataBuffer[Self.FrameStartIdx + 1] & 0x18) >>> 3;
				// Layer index
				var lyr = (Self.DataBuffer[Self.FrameStartIdx + 1] & 0x06) >>> 1;
				// Padding? 0/1
				var pad = (Self.DataBuffer[Self.FrameStartIdx + 2] & 0x02) >>> 1;
				// Bitrate index
				var brx = (Self.DataBuffer[Self.FrameStartIdx + 2] & 0xf0) >>> 4;
				// SampRate index
				var srx = (Self.DataBuffer[Self.FrameStartIdx + 2] & 0x0c) >>> 2;
				
				// Resolve flags to real values
				var bitrate   = Self.mpeg_bitrates[ver][lyr][brx] * 1000;
				var samprate  = Self.mpeg_srates[ver][srx];
				var samples   = Self.mpeg_frame_samples[ver][lyr];
				var slot_size = Self.mpeg_slot_size[lyr];
			
				// In-between calculations
				var bps       = samples / 8.0;
				var fsize     = ( (bps * bitrate) / samprate ) + ( (pad == 1) ? slot_size : 0 );
    
				// Truncate to integer
				var FrameSize = Math.floor(fsize)
			
				// Store number of samples and samplerate for frame
				Self.FrameSamples = samples;
				Self.FrameSampleRate = samprate;
			
				// Set end frame boundry
				Self.FrameEndIdx = Self.FrameStartIdx + FrameSize;
			}
		}
	}

	// Checks if there is a frame ready to be extracted
	function CanExtractFrame ()
	{
		if (Self.FrameStartIdx < 0 || Self.FrameEndIdx < 0)
			return false;
		else if (Self.FrameEndIdx < Self.DataBuffer.length)
			return true;
		else
			return false;
	}

	// Extract a single frame from the buffer
	function ExtractFrame()
	{
		// Extract frame data from buffer
		var framearray = Self.DataBuffer.buffer.slice(Self.FrameStartIdx, Self.FrameEndIdx);
		
		// Remove frame from buffer
		if ((Self.FrameEndIdx + 1) < Self.DataBuffer.length)
			Self.DataBuffer = new Uint8Array(Self.DataBuffer.buffer.slice(Self.FrameEndIdx));
		else
			Self.DataBuffer = new Uint8Array(0);
		
		// Reset Start/End indices
		Self.FrameStartIdx = 0;
		Self.FrameEndIdx = -1;
		
		return {'data': new Uint8Array(framearray), 'samples': Self.FrameSamples, 'rate': Self.FrameSampleRate};
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
