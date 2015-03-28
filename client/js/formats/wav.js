/*
	WAV-Audio-Format-Reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/
function AudioFormatReader_WAV (ErrorCallback, DataReadyCallback)
{
	// Used to reference the current instance of this class within callback functions and methods
	var Self = this;
	
	// Dependencies:
	// =============
	
	// Check callback argument
	if (typeof ErrorCallback !== 'function')
		throw new Error('AudioFormatReader_WAV: ErrorCallback must be specified');
	if (typeof DataReadyCallback !== 'function')
		throw new Error('AudioFormatReader_WAV: DataReadyCallback must be specified');
	
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
		throw new Error('AudioFormatReader_WAV: Browser does not support "AudioContext".');
	
	// Constants:
	// ==========
	
	// Number of bytes to decode together
	if (isAndroid && isNativeChrome)
		this.BatchSize = 8192;
	else if (isAndroid && isFirefox)
		this.BatchSize = 8192;
	else
		this.BatchSize = 512;

	if (isAndroid && isNativeChrome)
		this.ExtraEdgeBytes = 32;
	else if (isAndroid && isFirefox)
		this.ExtraEdgeBytes = 32;
	else
		this.ExtraEdgeBytes = 32;


	// Internal variables:
	// ===================
	
	// Stores if we have a header already
	this.GotHeader = false;
	
	// Stores the RIFF header
	this.RiffHeader = null;
	
	// Stores sample rate from RIFF header
	this.WaveSampleRate = 0;
	
	// Stores bit depth from RIFF header
	this.WaveBitsPerSample = 0;
	this.WaveBytesPerSample = 0;
	
	// Stores number of channels from RIFF header
	this.WaveChannels = 0;
	
	// Data buffer for "raw" samples
	this.DataBuffer = new Uint8Array(0);
	
	// Array for individual bunches of converted (float) samples
	this.FloatSamples = new Array();
	
	
	// Methods (external functions):
	// =============================
	
	// Pushes int sample data into the buffer
	this.PushData = PushData;
	function PushData (data)
	{
		// Append data to pagedata buffer
		Self.DataBuffer = appendBuffer(Self.DataBuffer, new Uint8Array(data));
		// Try to extract pages
		ExtractAllIntSamples ();
	}
	
	// Check if there are any samples ready for playback
	this.SamplesAvailable = SamplesAvailable;
	function SamplesAvailable ()
	{
		return (Self.FloatSamples.length > 0);
	}
	
	// Returns a bunch of samples for playback and removes the from the array
	this.PopSamples = PopSamples;
	function PopSamples ()
	{
		if (Self.FloatSamples.length > 0)
		{
			// Get first bunch of samples
			var audioBuffer = Self.FloatSamples[0];
			// Remove said bunch from the array
			Self.FloatSamples.shift();
			// Hand it back to callee
			return audioBuffer;
		}
		else
			return null;
	}

	// Used to force sample extraction externaly
	this.Poke = Poke;
	function Poke ()
	{
		ExtractAllIntSamples ();
	}
	
	// Deletes all samples from the databuffer and the samplearray
	this.PurgeData = PurgeData;
	function PurgeData ()
	{
		Self.DataBuffer = new Uint8Array(0);
		Self.FloatSamples = new Array();
	}
	
	
	// Internal functions:
	// ===================
	
	// Extracts all currently possible samples
	function ExtractAllIntSamples ()
	{
		if (!Self.GotHeader)
			FindAndExtractHeader();
		else
		{
			while(CanExtractSamples())
			{
				// Extract samples
				var tmpSamples = ExtractIntSamples();
				
				// Note:
				// =====
				// When audio data is resampled we get edge-effects at beginnging and end.
				// We should be able to compensate for that by keeping the last sample of the
				// previous batch and adding it to the beginning of the current one, but then
				// cutting it out AFTER the resampling (since the same effects apply to it)
				// The effects at the end can be compensated by cutting the resampled samples shorter
				// This is not trivial for non-natural ratios (e.g. 16kHz -> 44.1kHz). Because we would have
				// to cut out a non-natural number of samples at beginning and end.
				
				// TODO: All of the above...
				
				// Create a buffer long enough to hold everything
				var samplesbuffer = new Uint8Array(Self.RiffHeader.length + tmpSamples.length);
				
				var offset = 0;
				
				// Add header
				samplesbuffer.set(Self.RiffHeader, offset);
				offset += Self.RiffHeader.length;

				// Add samples
				samplesbuffer.set(tmpSamples, offset);

				// Push pages to the decoder
				Self.SoundContext.decodeAudioData(samplesbuffer.buffer, decodeSuccess, decodeError);
			}
		}
	}

	// Is called if the decoding of the samples succeeded
	function decodeSuccess (buffer)
	{	
		// Calculate the length of the parts
		var rateRatio = Self.SoundContext.sampleRate / Self.WaveSampleRate;
		var length = Math.ceil(Self.BatchSize / Self.WaveBytesPerSample  * rateRatio);
		var offset = Math.floor((buffer.length - length) / 2);

		// Create a buffer that can hold a single part
		var audioBuffer = Self.SoundContext.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
		
		// Fill buffer with the last part of the decoded frame
		for (var i = 0; i < buffer.numberOfChannels; i++)
			audioBuffer.getChannelData(i).set(buffer.getChannelData(i).subarray(offset, offset+length));
		
		// Push samples into arrray
		Self.FloatSamples.push(audioBuffer);

		// Callback to tell that data is ready
		Self.DataReadyCallback();
	}
	
	// Is called in case the decoding of the samples fails
	function decodeError ()
	{
		Self.ErrorCallback();
	}
	
	// Finds riff header within the data buffer and extracts it
	function FindAndExtractHeader ()
	{	
		var curpos = 0;
		// Make sure a whole header can fit
		if ( !((curpos + 4) < Self.DataBuffer.length) )
			return;
		
		// Check chunkID, should be "RIFF"
		if ( !(Self.DataBuffer[curpos] == 0x52 && Self.DataBuffer[curpos + 1] == 0x49 && Self.DataBuffer[curpos + 2] == 0x46 && Self.DataBuffer[curpos + 3] == 0x46) )
			return;
		
		curpos += 8;
		
		if ( !((curpos + 4) < Self.DataBuffer.length) )
			return;
		
		// Check riffType, should be "WAVE"
		if ( !(Self.DataBuffer[curpos] == 0x57 && Self.DataBuffer[curpos + 1] == 0x41 && Self.DataBuffer[curpos + 2] == 0x56 && Self.DataBuffer[curpos + 3] == 0x45) )
			return;
		
		curpos += 4;
		
		if ( !((curpos + 4) < Self.DataBuffer.length) )
			return;
		
		// Check for format subchunk, should be "fmt "
		if ( !(Self.DataBuffer[curpos] == 0x66 && Self.DataBuffer[curpos + 1] == 0x6d && Self.DataBuffer[curpos + 2] == 0x74 && Self.DataBuffer[curpos + 3] == 0x20) )
			return;
			
		curpos += 4;
		
		if ( !((curpos + 4) < Self.DataBuffer.length) )
			return;
		
		var SubchunkSize  = Self.DataBuffer[curpos] | Self.DataBuffer[curpos + 1] << 8 | Self.DataBuffer[curpos + 2] << 16 | Self.DataBuffer[curpos + 3] << 24;
		
		if ( !((curpos + 4 + SubchunkSize) < Self.DataBuffer.length) )
			return;
		
		curpos += 6;
		
		Self.WaveChannels = Self.DataBuffer[curpos] | Self.DataBuffer[curpos + 1] << 8;
		
		curpos += 2;
		
		Self.WaveSampleRate = Self.DataBuffer[curpos] | Self.DataBuffer[curpos + 1] << 8 | Self.DataBuffer[curpos + 2] << 16 | Self.DataBuffer[curpos + 3] << 24;
		
		curpos += 10;
		
		Self.WaveBitsPerSample = Self.DataBuffer[curpos] | Self.DataBuffer[curpos + 1] << 8;
		
		Self.WaveBytesPerSample = Self.WaveBitsPerSample / 8;
				
		curpos += SubchunkSize - 14;
		
		var end = false;
			
		while (!end)
		{
			if ((curpos + 8) < Self.DataBuffer.length)
			{
				var SubchunkSize  = Self.DataBuffer[curpos + 4] | Self.DataBuffer[curpos + 5] << 8 | Self.DataBuffer[curpos + 6] << 16 | Self.DataBuffer[curpos + 7] << 24;
				// Check for data subchunk, should be "data"
				if (Self.DataBuffer[curpos] == 0x64 && Self.DataBuffer[curpos + 1] == 0x61 && Self.DataBuffer[curpos + 2] == 0x74 && Self.DataBuffer[curpos + 3] == 0x61) // Data chunk found
					end = true;
				else
					curpos += 8 + SubchunkSize;
				
			}
			else
				return;
		}
		curpos += 8;
		
		Self.RiffHeader = new Uint8Array(Self.DataBuffer.buffer.slice(0, curpos));

		var BatchSampleSize = (Self.BatchSize + Self.ExtraEdgeBytes * 2);
		var TotalBatchSize = BatchSampleSize + Self.RiffHeader.length;
		
		// Fix header
		Self.RiffHeader[4] = TotalBatchSize & 0xFF;
		Self.RiffHeader[5] = (TotalBatchSize & 0xFF00) >>> 8;
		Self.RiffHeader[6] = (TotalBatchSize & 0xFF0000) >>> 16;
		Self.RiffHeader[7] = (TotalBatchSize & 0xFF000000) >>> 24;

		Self.RiffHeader[Self.RiffHeader.length-4] = BatchSampleSize & 0xFF;
		Self.RiffHeader[Self.RiffHeader.length-3] = (BatchSampleSize & 0xFF00) >>> 8;
		Self.RiffHeader[Self.RiffHeader.length-2] = (BatchSampleSize & 0xFF0000) >>> 16;
		Self.RiffHeader[Self.RiffHeader.length-1] = (BatchSampleSize & 0xFF000000) >>> 24;

		Self.GotHeader = true;

		return;
	}

	// Checks if there is a samples ready to be extracted
	function CanExtractSamples ()
	{
		if (Self.DataBuffer.length >= (Self.BatchSize + 2 * Self.ExtraEdgeBytes))
			return true;
		else
			return false;
	}

	// Extract a single batch of samples from the buffer
	function ExtractIntSamples()
	{
		// Extract sample data from buffer
		var intsamplearray = new Uint8Array(Self.DataBuffer.buffer.slice(0, Self.BatchSize + 2 * Self.ExtraEdgeBytes));
		
		console.log(intsamplearray.length, Self.DataBuffer.length);
		
		// Remove samples from buffer
		if (Self.DataBuffer.length > (Self.BatchSize + 2 * Self.ExtraEdgeBytes))
			Self.DataBuffer = new Uint8Array(Self.DataBuffer.buffer.slice(Self.BatchSize));
		else
			Self.DataBuffer = new Uint8Array(0);
		
		console.log(Self.DataBuffer.length);
		
		return intsamplearray;
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
