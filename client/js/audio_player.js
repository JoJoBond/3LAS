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

PCMAudioPlayer.prototype._StartOffset = 0.4;


// Constants:
// ==========

// Crystal oscillator have a variance of about +/- 100ppm
// So worst case would be a difference of 200ppm between two oscillators.
PCMAudioPlayer.prototype._SpeedCorrectionParameter = 200 / 1.0e6;

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

    // Check if this is the first buffer we received
    if (this._NextTime == 0.0) {
        // Start playing [StartOffset] s from now
        this._NextTime = this._SoundContext.currentTime + this._StartOffset;
    }

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

            // Check if we ran out of time
            if (this._NextTime <= this._SoundContext.currentTime) {
                if (this._NextTime + AudioBuffer.duration < this._SoundContext.currentTime) {
                    //this._NextTime += AudioBuffer.duration * 1.01;
                    //return;
                }
                // In that case reschedule the playback to [StartOffset]/2.0 s from now
                //this._NextTime = this._SoundContext.currentTime;// + StartOffset / 2.0;
                //if (typeof this._UnderrunCallback === 'function')
                //	this._UnderrunCallback();
            }
        }
        else {
            // Check if we are in time		
            if ((this._Speed > 1.0 && (this._NextTime - this._SoundContext.currentTime < this._StartOffset)) ||
                (this._Speed < 1.0 && (this._NextTime - this._SoundContext.currentTime > this._StartOffset))) {
                // We within our min/max offset, set playpacks to default
                this._Speed = 1.0;
                console.log("normal speed");
            }
        }

        // Set playback speed
        SourceNode.playbackRate.value = this._Speed;
    }

    // Schedule playback
    SourceNode.start(this._NextTime);
    //SourceNode.start();

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
