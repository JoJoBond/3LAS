/*
    Live audio player is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/

class LiveAudioPlayer {
    // Crystal oscillator have a variance of about +/- 20ppm
    // So worst case would be a difference of 40ppm between two oscillators.
    private static readonly SpeedCorrectionFactor: number = 40 / 1.0e6;

    // Hystersis value for speed up/down trigger
    private static readonly OffsetVariance: number = 0.2;

    private readonly Audio: AudioContext;
    private readonly Logger: Logging;
    private readonly MaxVolume: number;
    private readonly StartOffset: number;
    private readonly VariableSpeed: boolean;

    private readonly OffsetMin: number;
    private readonly OffsetMax: number;

    private PlaybackSpeed: number;
    private NextScheduleTime: number;
    private Amplification: GainNode;

    constructor(audio: AudioContext, logger: Logging, maxVolume: number = 1.0, startOffset: number = 0.33, variableSpeed: boolean = false) {
        this.Audio = audio;
        this.Logger = logger;
        this.MaxVolume = maxVolume;
        this.StartOffset = startOffset;
        this.VariableSpeed = variableSpeed;

        this.OffsetMin = this.StartOffset - LiveAudioPlayer.OffsetVariance;
        this.OffsetMax = this.StartOffset + LiveAudioPlayer.OffsetVariance;

        // Set speed to default
        this.PlaybackSpeed = 1.0;

        // Reset variable for scheduling times
        this.NextScheduleTime = 0.0;

        // Create gain node for volume control
        this.Amplification = this.Audio.createGain();

        // Set volume to max
        this.Amplification.gain.value = 1.0;

        // Connect gain node to context
        this.Amplification.connect(this.Audio.destination);
    }

    public set Volume(value: number) {
        // Clamp value to [1e-20 ; MaxVolume]
        if (value > 1.0)
            value = this.MaxVolume;
        else if (value <= 0.0)
            value = 1e-20;

        // Cancel any scheduled ramps
        this.Amplification.gain.cancelScheduledValues(this.Audio.currentTime);

        // Change volume following a ramp (more userfriendly)
        this.Amplification.gain.exponentialRampToValueAtTime(value, this.Audio.currentTime + 0.5);
    }

    public get Volume(): number {
        // Get volume from gain node
        return this.Amplification.gain.value;
    }

    // Recieves an audiobuffer and schedules it for seamless playback
    public PushBuffer(buffer: AudioBuffer): void {

        // Check if this is the first buffer we received
        if (this.NextScheduleTime == 0.0) {
            // Start playing [StartOffset] s from now
            this.NextScheduleTime = this.Audio.currentTime + this.StartOffset;
        }

        let duration: number
        if (this.VariableSpeed)
            duration = buffer.duration / this.PlaybackSpeed; // Use regular duration
        else
            duration = buffer.duration; // Use duration adjusted for playback speed

        // Before creating a buffer and scheduling playback, check if playing this buffer makes sense at all
        // If a buffer should have been started so far in the past that it would have finished playing by now, we are better of skipping it.
        // But we still need to move the time forward to keep future timings right.
        if (this.NextScheduleTime + duration > this.Audio.currentTime) {

            let skipDurationTime: number;

            // If the playback start time is in the past but the playback end time is in the future, we need to partially play the buffer.
            if (this.Audio.currentTime >= this.NextScheduleTime) {
                // Calculate the time we need to skip
                skipDurationTime = this.Audio.currentTime - this.NextScheduleTime + 0.05;
            }
            else {
                // No skipping needed
                skipDurationTime = 0.0;
            }

            // Check if we'd skip the whole buffer anyway
            if (skipDurationTime < duration) {

                // Create new audio source for the buffer
                let sourceNode: AudioBufferSourceNode = this.Audio.createBufferSource();

                // Make sure the node deletes itself after playback
                sourceNode.onended = function (_ev: Event) {
                    sourceNode.disconnect();
                };

                // Prevent looping (the standard says that it should be off by default)
                sourceNode.loop = false;

                // Pass audio data to source
                sourceNode.buffer = buffer;

                //Connect the source to the gain node
                sourceNode.connect(this.Amplification);

                if (this.VariableSpeed) {
                    let scheduleOffset: number = this.NextScheduleTime - this.Audio.currentTime;

                    // Check if we are to far or too close to target schedule time
                    if (this.NextScheduleTime - this.Audio.currentTime > this.OffsetMax) {
                        if (this.PlaybackSpeed < 1.0 + LiveAudioPlayer.SpeedCorrectionFactor) {
                            // We are too slow, speed up playback (somewhat noticeable)

                            this.Logger.Log("Buffer size too large, speeding up playback.");
                            this.PlaybackSpeed = 1.0 + LiveAudioPlayer.SpeedCorrectionFactor;
                            duration = buffer.duration / this.PlaybackSpeed;
                        }
                    }
                    else if (this.NextScheduleTime - this.Audio.currentTime < this.OffsetMin) {
                        if (this.PlaybackSpeed > 1.0 - LiveAudioPlayer.SpeedCorrectionFactor) {
                            // We are too fast, slow down playback (somewhat noticeable)

                            this.Logger.Log("Buffer size too small, slowing down playback.");
                            this.PlaybackSpeed = 1.0 - LiveAudioPlayer.SpeedCorrectionFactor;
                            duration = buffer.duration / this.PlaybackSpeed;
                        }
                    }
                    else {
                        // Check if we are in time		
                        if ((this.PlaybackSpeed > 1.0 && (this.NextScheduleTime - this.Audio.currentTime < this.StartOffset)) ||
                            (this.PlaybackSpeed < 1.0 && (this.NextScheduleTime - this.Audio.currentTime > this.StartOffset))) {
                            // We are within our min/max offset, set playpacks to default

                            this.Logger.Log("Buffer size within limits, using normal playback speed.");
                            this.PlaybackSpeed = 1.0;
                            duration = buffer.duration;
                        }
                    }

                    // Set playback speed
                    sourceNode.playbackRate.value = this.PlaybackSpeed;
                }

                // Schedule playback
                sourceNode.start(this.NextScheduleTime + skipDurationTime, skipDurationTime);
            }
            else {
                this.Logger.Log("Skipped buffer because it became too old.");
            }
        }
        else {
            this.Logger.Log("Skipped buffer because it was too old.");
        }

        // Move time forward
        this.NextScheduleTime += duration;
    }

    public Reset(): void {
        this.NextScheduleTime = 0.0;
    }

    public CheckBeforeDecode(playbackLength: number): boolean {
        if (this.NextScheduleTime == 0)
            return true;

        return this.NextScheduleTime + playbackLength > this.Audio.currentTime;
    }
}