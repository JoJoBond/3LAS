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
	this.BatchSize = 512;

	this.ExtraEdgeSamples = 0;


	// Internal variables:
	// ===================
	
	// Stores if we have a header already
	this.GotHeader = false;
	
	// Stores the RIFF header
	this.RiffHeader = null;
	
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
				var samplesbuffer = new Uint8Array(Self.RiffHeader.length + tmpSamples.length + Self.ExtraEdgeSamples * 2 * 2);
				
				var offset = 0;
				
				// Add header
				samplesbuffer.set(Self.RiffHeader, offset);
				offset += Self.RiffHeader.length;
				
				for (var i = 0; i < Self.ExtraEdgeSamples; i++)
				{
					samplesbuffer[offset++] = tmpSamples[0];
					samplesbuffer[offset++] = tmpSamples[1];
				}

				// Add samples
				samplesbuffer.set(tmpSamples, offset);
				offset += tmpSamples.length;

				for (var i = 0; i < Self.ExtraEdgeSamples; i++)
				{
					samplesbuffer[offset++] = tmpSamples[tmpSamples.length-2];
					samplesbuffer[offset++] = tmpSamples[tmpSamples.length-1];
				}

				// Push pages to the decoder
				Self.SoundContext.decodeAudioData(samplesbuffer.buffer, decodeSuccess, decodeError);
			}
		}
	}

	// Is called if the decoding of the samples succeeded
	function decodeSuccess (buffer)
	{	
		// Calculate the length of the parts
		var ratio = buffer.length / (Self.BatchSize + Self.ExtraEdgeSamples);
		var offset = Math.ceil((Self.ExtraEdgeSamples/2.0) * ratio);
		var length = Math.ceil(Self.BatchSize * ratio);
		
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
		if ((curpos + 4) < Self.DataBuffer.length)
		{
			// Check ChunkID
			if (Self.DataBuffer[curpos] == 0x52 && Self.DataBuffer[curpos + 1] == 0x49 && Self.DataBuffer[curpos + 2] == 0x46 && Self.DataBuffer[curpos + 3] == 0x46)
			{
				curpos = 8;
				
				if ((curpos + 4) < Self.DataBuffer.length)
				{
					if (Self.DataBuffer[curpos] == 0x57 && Self.DataBuffer[curpos + 1] == 0x41 && Self.DataBuffer[curpos + 2] == 0x56 && Self.DataBuffer[curpos + 3] == 0x45)
					{
						curpos = 12;
						var end = false;
							
						while (!end)
						{
							if ((curpos + 8) < Self.DataBuffer.length)
							{
								var SubchunkSize  = Self.DataBuffer[curpos + 4] | Self.DataBuffer[curpos + 5] << 8 | Self.DataBuffer[curpos + 6] << 16 | Self.DataBuffer[curpos + 7] << 24;
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

						var TotalBatchSize = Self.BatchSize + Self.RiffHeader.length;
						
						// Fix header
						Self.RiffHeader[4] = TotalBatchSize & 0xFF;
						Self.RiffHeader[5] = (TotalBatchSize & 0xFF00) >>> 8;
						Self.RiffHeader[6] = (TotalBatchSize & 0xFF0000) >>> 16;
						Self.RiffHeader[7] = (TotalBatchSize & 0xFF000000) >>> 24;

						Self.RiffHeader[Self.RiffHeader.length-4] = Self.BatchSize & 0xFF;
						Self.RiffHeader[Self.RiffHeader.length-3] = (Self.BatchSize & 0xFF00) >>> 8;
						Self.RiffHeader[Self.RiffHeader.length-2] = (Self.BatchSize & 0xFF0000) >>> 16;
						Self.RiffHeader[Self.RiffHeader.length-1] = (Self.BatchSize & 0xFF000000) >>> 24;

						Self.GotHeader = true;

						return;
					}
				}
			}
		}
	}

	// Checks if there is a samples ready to be extracted
	function CanExtractSamples ()
	{
		if (Self.DataBuffer.length >= Self.BatchSize)
			return true;
		else
			return false;
	}

	// Extract a single batch of samples from the buffer
	function ExtractIntSamples()
	{
		// Extract sample data from buffer
		var intsamplearray = new Uint8Array(Self.DataBuffer.buffer.slice(0, Self.BatchSize));

		// Remove samples from buffer
		if ((Self.BatchSize + 1) < Self.DataBuffer.length)
			Self.DataBuffer = new Uint8Array(Self.DataBuffer.buffer.slice(Self.BatchSize));
		else
			Self.DataBuffer = new Uint8Array(0);
		
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
