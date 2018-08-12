/*
	Audio-Player is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

function PCMAudioPlayer ()
{
	// Create audio context
	if (typeof AudioContext !== "undefined")
		this._SoundContext = new AudioContext();
	else if (typeof webkitAudioContext !== "undefined")
		this._SoundContext = new webkitAudioContext();	
	else if (typeof mozAudioContext !== "undefined")
		this._SoundContext = new mozAudioContext();
	else
		throw new Error('PCMAudioPlayer: Browser does not support "AudioContext".');
	
	// Set speed to default
	this._Speed = 1.0;
	
	// Prepare variable for scheduling times
	this._NextTime = 0.0;

	// Create gain node for volume control
	this._GainNode = this._SoundContext.createGain();

	// Set volume to max
	this._GainNode.gain.value = 1.0;
	
	// Connect gain node to context
	this._GainNode.connect(this._SoundContext.destination);
}


// Settings:
// =========

PCMAudioPlayer.prototype._VariSpeed = false;

PCMAudioPlayer.prototype._StartOffset = 0.33;


// Constants:
// ==========

// Crystal oscillator have a variance of about +/- 20ppm
// So worst case would be a difference of 40ppm between two oscillators.
PCMAudioPlayer.prototype._SpeedCorrectionParameter = 40 / 1.0e6;

PCMAudioPlayer.prototype._OffsetVariance = 0.2;

PCMAudioPlayer.prototype._OffsetMin = PCMAudioPlayer.prototype._StartOffset - PCMAudioPlayer.prototype._OffsetVariance;
PCMAudioPlayer.prototype._OffsetMax = PCMAudioPlayer.prototype._StartOffset + PCMAudioPlayer.prototype._OffsetVariance;


// Pubic methods (external functions):
// ===================================

// Sets the playback volome
PCMAudioPlayer.prototype.SetVolume = function (Value) {
	// Limit value to [0.0 ; 1.0]
	/*if (Value > 1.0)
		Value = 1.0;
	else */if (Value <= 0.0)
        Value = 1e-20;

    // Cancel any scheduled ramps
    this._GainNode.gain.cancelScheduledValues(this._SoundContext.currentTime);

    // Change volume following a ramp (more userfriendly)
    this._GainNode.gain.exponentialRampToValueAtTime(Value, this._SoundContext.currentTime + 0.5);
};

// Gets the playback volume
PCMAudioPlayer.prototype.GetVolume = function () {
    // Get volume from gain node
    return this._GainNode.gain.value;
};

// Unmutes mobile devices (e.g. iPhones)
PCMAudioPlayer.prototype.MobileUnmute = function () {
    // Create one second buffer with silence		
    var audioBuffer = this._SoundContext.createBuffer(2, this._SoundContext.sampleRate, this._SoundContext.sampleRate);

    // Create new audio source for the buffer
    var SourceNode = this._SoundContext.createBufferSource();

    // Make sure the node deletes itself after playback
    SourceNode.onended = function () {
        var ThisNode = SourceNode;
        ThisNode.disconnect();
        ThisNode = null;
    };

    // Pass audio data to source
    SourceNode.buffer = audioBuffer;

    // Connect the source to the gain node
    SourceNode.connect(this._GainNode);

    // Play source		
    SourceNode.start(0);
};

// Decodes audio data
PCMAudioPlayer.prototype.DecodeAudioData = function (audioData, successCallback, errorCallback) {
    if (typeof errorCallback !== 'function')
        errorCallback = function () { };
    // Call decoder
    return this._SoundContext.decodeAudioData(audioData, successCallback, errorCallback);
};

// Creates audio buffers
PCMAudioPlayer.prototype.CreateBuffer = function (numberOfChannels, length, sampleRate) {
    // Call decoder
    return this._SoundContext.createBuffer(numberOfChannels, length, sampleRate);
};

// Recieves an audiobuffer and schedules it for seamless playback
PCMAudioPlayer.prototype.PushBuffer = function (AudioBuffer) {

    // Check if this is the first buffer we received
    if (this._NextTime == 0.0) {
        // Start playing [StartOffset] s from now
        this._NextTime = this._SoundContext.currentTime + this._StartOffset;
    }
    
    // Before creating a buffer and scheduling playback, check if playing this buffer makes sense at all
    // If a buffer should have been started so far in the past that it would have finished playing by now, we are better of skipping it.
    // But we still need to move the time forward to keep future timings right.
    if (this._NextTime + AudioBuffer.duration > this._SoundContext.currentTime) {

        var OffsetTime;

        // If the playback start time is in the past but the playback end time is in the future, we need to partially play the buffer.
        if (this._SoundContext.currentTime >= this._NextTime) {
            // Calculate the time we need to skip
            OffsetTime = this._SoundContext.currentTime - this._NextTime + 0.1;
        }
        else {
            // No skipping needed
            OffsetTime = 0.0;
        }

        // Check if we'd skip the whole buffer anyway
        if (OffsetTime < AudioBuffer.duration) {

            // Create new audio source for the buffer
            var SourceNode = this._SoundContext.createBufferSource();

            // Make sure the node deletes itself after playback
            SourceNode.onended = function () {
                var ThisNode = SourceNode;
                ThisNode.disconnect();
                ThisNode = null;
            };

            // Prevent looping (the standard says that it should be off by default)
            SourceNode.loop = false;

            // Pass audio data to source
            SourceNode.buffer = AudioBuffer;

            //Connect the source to the gain node
            SourceNode.connect(this._GainNode);

            if (this._VariSpeed) {
                // Check if we are to far or too close to target schedule time
                if (this._NextTime - this._SoundContext.currentTime > this._OffsetMax) {
                    if (this._Speed < 1.0 + this._SpeedCorrectionParameter) {
                        // We are too slow, speed up playback (somewhat noticeable)

                        console.log("speed up");
                        this._Speed = 1.0 + this._SpeedCorrectionParameter;
                    }
                }
                else if (this._NextTime - this._SoundContext.currentTime < this._OffsetMin) {
                    if (this._Speed > 1.0 - this._SpeedCorrectionParameter) {
                        // We are too fast, slow down playback (somewhat noticeable)

                        console.log("speed down");
                        this._Speed = 1.0 - this._SpeedCorrectionParameter;
                    }
                }
                else {
                    // Check if we are in time		
                    if ((this._Speed > 1.0 && (this._NextTime - this._SoundContext.currentTime < this._StartOffset)) ||
                        (this._Speed < 1.0 && (this._NextTime - this._SoundContext.currentTime > this._StartOffset))) {
                        // We are within our min/max offset, set playpacks to default

                        console.log("normal speed");
                        this._Speed = 1.0;
                    }
                }

                // Set playback speed
                SourceNode.playbackRate.value = this._Speed;
            }

            // Schedule playback
            SourceNode.start(this._NextTime + OffsetTime, OffsetTime);
        }
    }

    // Move time forward
    if (!this._VariSpeed || this._Speed == 1.0) {
        // Use recular duration
        this._NextTime += AudioBuffer.duration;
    }
    else {
        // Use duration adjusted for playback speed
        this._NextTime += (AudioBuffer.duration / this._Speed);// - (1.0 / this._SoundContext.sampleRate);
    }
};
