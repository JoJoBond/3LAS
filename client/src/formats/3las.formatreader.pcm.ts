/*
	PCM audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

class AudioFormatReader_PCM extends AudioFormatReader implements IAudioFormatReader {
    // Stores sample rate
    private readonly SampleRate: number;

    // Stores bit depth
    private readonly BitDepth: number;

    // Stores number of channels
    private readonly Channels: number;

    // Stores denominator
    private readonly Denominator: number;

    // Number of PCM samples to convert together
    private readonly BatchSize: number;

    // Number of bytes to convert together
    private readonly BatchByteSize: number;

    // Data buffer for "raw" samples
    private DataBuffer: Uint8Array;

    // Array for individual bunches of converted (float) samples
    private FloatSamples: Array<AudioBuffer>;

    constructor(audio: AudioContext, logger: Logging, errorCallback: () => void, dataReadyCallback: () => void, sampleRate: number, bitDepth: number, channels: number, batchSize: number)
    {
        super(audio, logger, errorCallback, dataReadyCallback);

        this.SampleRate = sampleRate;
        this.BitDepth = bitDepth;
        this.Channels = channels;
        this.BatchSize = batchSize;
        this.BatchByteSize = this.BatchSize * this.Channels * Math.ceil(this.BitDepth / 8 );

        this.Denominator = Math.pow(2, this.BitDepth - 1);
        this.DataBuffer = new Uint8Array(0);
        this.FloatSamples = new Array();
    }

    // Pushes int sample data into the buffer
    public PushData(data: Uint8Array): void {
        // Append data to pagedata buffer
        this.DataBuffer = this.ConcatUint8Array(this.DataBuffer, data);
        // Try to extract pages
        this.ConvertSamples();
    }

    // Check if there are any samples ready for playback
    public SamplesAvailable(): boolean {
        return (this.FloatSamples.length > 0);
    }

    // Returns a bunch of samples for playback and removes the from the array
    public PopSamples(): AudioBuffer {
        if (this.FloatSamples.length > 0) {
            // Get first bunch of samples, remove said bunch from the array and hand it back to callee
            return this.FloatSamples.shift();
        }
        else
            return null;
    }

    // Used to force sample extraction externaly
    public Poke(): void {
        this.ConvertSamples();
    }

    // Deletes all samples from the databuffer and the samplearray
    public PurgeData(): void {
        this.DataBuffer = new Uint8Array(0);
        this.FloatSamples = new Array();
    }

    private ConvertSamples(): void {
        while (this.CanExtractSamples()) {
            let audioBuffer: AudioBuffer = this.Audio.createBuffer(this.Channels, this.BatchSize, this.SampleRate);
            let tmpSamples: Uint8Array = this.ExtractPCMSamples();

            try {
                // Extract samples
                let dataView: DataView = new DataView(tmpSamples.buffer);
                let floatBuffer: Float32Array;
                if(this.BitDepth == 8) {
                    floatBuffer = new Float32Array(tmpSamples.length);
                    for(let i: number = 0; i < tmpSamples.length; i++) {
                        floatBuffer[i] = dataView.getInt8(i) / this.Denominator;
                    }
                }
                else if(this.BitDepth == 16) {
                    floatBuffer = new Float32Array(tmpSamples.length / 2);
                    for(let i: number = 0, j: number = 0; i < tmpSamples.length; i+=2, j++) {
                        floatBuffer[j] = dataView.getInt16(i, true) / this.Denominator;
                    }
                }
                else if(this.BitDepth == 24) {
                    floatBuffer = new Float32Array(tmpSamples.length / 3);
                    for(let i: number = 0, j: number = 0; i < tmpSamples.length; i+=3, j++) {
                        floatBuffer[j] = (dataView.getUint8(i) | (dataView.getInt16(i+1, true) << 8))  / this.Denominator;
                    }
                }
                else if(this.BitDepth == 32) {
                    floatBuffer = new Float32Array(tmpSamples.length / 4);
                    for(let i: number = 0, j: number = 0; i < tmpSamples.length; i+=4, j++) {
                        floatBuffer[j] = dataView.getInt32(i, true) / this.Denominator;
                    }
                }
                
                // Copy samples into AudioBuffer
                if(this.Channels == 1) {
                    audioBuffer.copyToChannel(floatBuffer, 0, 0);
                }
                else {
                    let floatBuffers: Array<Float32Array> = new Array();
                    for(let i: number = 0; i < this.Channels; i++) {
                        floatBuffers.push(new Float32Array(floatBuffer.length / this.Channels));
                    }

                    for(let i: number = 0, j: number = 0, k: number = 0; i < floatBuffer.length; i++) {
                        floatBuffers[j][k] = floatBuffer[i];

                        if(++j >= this.Channels){
                            j = 0;
                            k++;
                        }
                    }

                    floatBuffer = null;

                    for(let i: number = 0; i < this.Channels; i++) {
                        audioBuffer.copyToChannel(floatBuffers[i], i, 0);
                    }
                }
            }
            catch (e) {
                this.ErrorCallback();
                return;
            }

            // Push samples into arrray
            this.FloatSamples.push(audioBuffer);

            // Callback to tell that data is ready
            this.DataReadyCallback();
        }
    }

    // Checks if there is a samples ready to be extracted
    private CanExtractSamples(): boolean {
        return this.DataBuffer.length >= this.BatchByteSize;
    }

    // Extract a single batch of samples from the buffer
    public ExtractPCMSamples(): Uint8Array {
        // Extract sample data from buffer
        let intSampleArray: Uint8Array = new Uint8Array(this.DataBuffer.buffer.slice(0, this.BatchByteSize));

        // Remove samples from buffer
        this.DataBuffer = new Uint8Array(this.DataBuffer.buffer.slice(this.BatchByteSize));

        return intSampleArray;
    }
}