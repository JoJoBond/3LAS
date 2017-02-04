/*
	Audio-Player is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/
function PCMAudioPlayer ()
{
	// Used to reference the current instance of this class, within callback functions and methods
	var Self = this;
	
	var VariSpeed = false;
	
	var StartOffset    = 0.4;

	if (VariSpeed)
	{
		var SpeedCorrectionParameter = 0.01;
	
		var OffsetVariance = 0.2;
	
		var OffsetMin = StartOffset - OffsetVariance;
		var OffsetMax = StartOffset + OffsetVariance;
	}
	
	// Create audio context
	if (typeof AudioContext !== "undefined")
		this.SoundContext = new AudioContext();
	else if (typeof webkitAudioContext !== "undefined")
		this.SoundContext = new webkitAudioContext();	
	else if (typeof mozAudioContext !== "undefined")
		this.SoundContext = new mozAudioContext();
	else
		throw new Error('PCMAudioPlayer: Browser does not support "AudioContext".');
	
	// Set speed to default
	this.Speed = 1.0;
	
	// Prepare variable for scheduling times
	this.NextTime = 0.0;

	// Create gain node for volume control
	this.GainNode = this.SoundContext.createGain();

	// Set volume to max
	this.GainNode.gain.value = 1.0;
	
	// Connect gain node to context
	this.GainNode.connect(this.SoundContext.destination);
	
	// Sets the playback volome
	this.SetVolume = SetVolume;
	function SetVolume (Value)
	{
		// Limit value to [0.0 ; 1.0]
		/*if (Value > 1.0)
			Value = 1.0;
		else */if (Value <= 0.0)
			Value = 1e-20;
		
		// Cancel any scheduled ramps
		Self.GainNode.gain.cancelScheduledValues(Self.SoundContext.currentTime);
		
		// Change volume following a ramp (more userfriendly)
		Self.GainNode.gain.exponentialRampToValueAtTime(Value, Self.SoundContext.currentTime + 0.5);
	}
	
	// Gets the playback volume
	this.GetVolume = GetVolume;
	function GetVolume ()
	{
		// Get volume from gain node
		return Self.GainNode.gain.value;
	}

	// Unmutes mobile devices (e.g. iPhones)
	this.MobileUnmute = MobileUnmute;
	function MobileUnmute ()
	{
		// Create one second buffer with silence		
		var audioBuffer = Self.SoundContext.createBuffer(2, Self.SoundContext.sampleRate, Self.SoundContext.sampleRate);
		
		// Create new audio source for the buffer
		var SourceNode = Self.SoundContext.createBufferSource();
		
		// Make sure the node deletes itself after playback
		SourceNode.onended = function () {
			var ThisNode = SourceNode;
			ThisNode.disconnect();
			ThisNode = null;
		}
		
		// Pass audio data to source
		SourceNode.buffer = audioBuffer;
		
		// Connect the source to the gain node
		SourceNode.connect(Self.GainNode);
		
		// Play source		
		SourceNode.start(0);
	}
	
	// Decodes audio data
	this.DecodeAudioData = DecodeAudioData;
	function DecodeAudioData (audioData, successCallback, errorCallback)
	{
		if (typeof errorCallback !== 'function')
			errorCallback = function(){};
		// Call decoder
		return Self.SoundContext.decodeAudioData(audioData, successCallback, errorCallback);
	}
	
	// Creates audio buffers
	this.CreateBuffer = CreateBuffer;
	function CreateBuffer(numberOfChannels, length, sampleRate)
	{
		// Call decoder
		return Self.SoundContext.createBuffer(numberOfChannels, length, sampleRate);
	}
	
	// Recieves an audiobuffer and schedules it for seamless playback
	this.PushBuffer = PushBuffer;
	function PushBuffer (AudioBuffer)
	{
		// Create new audio source for the buffer
		var SourceNode = Self.SoundContext.createBufferSource();
		
		// Make sure the node deletes itself after playback
		SourceNode.onended = function () {
			var ThisNode = SourceNode;
			ThisNode.disconnect();
			ThisNode = null;
		}
		
		// Prevent looping (the standard says that it should be off by default)
		SourceNode.loop = false;
		
		// Pass audio data to source
		SourceNode.buffer = AudioBuffer;
		
		//Connect the source to the gain node
		SourceNode.connect(Self.GainNode);
		
		// Check if this is the first buffer we received
		if (Self.NextTime == 0.0)
		{
			// Start playing [StartOffset] s from now
			Self.NextTime = Self.SoundContext.currentTime + StartOffset;
		}
		
		if (VariSpeed)
		{
			// Check if we are to far or too close to target schedule time
			if (Self.NextTime - Self.SoundContext.currentTime > OffsetMax)
			{
				if (Self.Speed != 1.0 + SpeedCorrectionParameter)
					console.log("speed up");
				// We are too slow, speed up playback (somewhat noticeable)
				Self.Speed = 1.0 + SpeedCorrectionParameter;
			}
			else if(Self.NextTime - Self.SoundContext.currentTime < OffsetMin)
			{
				if (Self.Speed != 1.0 - SpeedCorrectionParameter)
					console.log("speed down");
				// We are too fast, slow down playback (somewhat noticeable)
				Self.Speed = 1.0 - SpeedCorrectionParameter;
				// Check if we ran out of time
				if (Self.NextTime <= Self.SoundContext.currentTime)
				{
					if (Self.NextTime + AudioBuffer.duration < Self.SoundContext.currentTime)
					{
						//Self.NextTime += AudioBuffer.duration * 1.01;
						//return;
					}
					// In that case reschedule the playback to [StartOffset]/2.0 s from now
					//Self.NextTime = Self.SoundContext.currentTime;// + StartOffset / 2.0;
					//if (typeof Self.UnderrunCallback === 'function')
					//	Self.UnderrunCallback();
				}
			}
			else
			{
				// Check if we are in time. If so, set playback to default speed			
				if ((Self.Speed > 1.0 && (Self.NextTime - Self.SoundContext.currentTime < StartOffset)) ||
					(Self.Speed < 1.0 && (Self.NextTime - Self.SoundContext.currentTime > StartOffset)))
				{
					Self.Speed = 1.0;
					console.log("normal speed");
				}
			}
			
			// Set playback speed
			SourceNode.playbackRate.value = Self.Speed;
		}
			
		// Schedule playback
		SourceNode.start(Self.NextTime);
		//SourceNode.start();

		// Move time forward
		if (!VariSpeed || Self.Speed == 1.0)
		{
			// Use recular duration
			Self.NextTime += AudioBuffer.duration;
		}
		else
		{
			// Use duration adjusted for playback speed
			Self.NextTime += (AudioBuffer.duration / Self.Speed);// - (1.0 / Self.SoundContext.sampleRate);
		}

	}
}
