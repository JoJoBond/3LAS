/*
	WAV audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

class AudioFormatReader_WAV extends AudioFormatReader implements IAudioFormatReader {
    private readonly BatchLength: number;
    private readonly ExtraEdgeLength: number;

    // Stores if we have a header already
    private GotHeader: boolean;
    
    // Stores the RIFF header
    private RiffHeader: Uint8Array;
    
    // Stores sample rate from RIFF header
    private WaveSampleRate: number;
    
    // Stores bit depth from RIFF header
    private WaveBitsPerSample: number;
    private WaveBytesPerSample: number;
    
    // Stores the size of a single datablock
    private WaveBlockAlign: number;
    
    // Stores number of channels from RIFF header
    private WaveChannels: number;
    
    // Stores the actual size of each batch in samples
    private BatchSamples: number;
    
    // Stores the actual size of each batch in bytes
    private BatchBytes: number;
    
    // Stores the actual size of the edge samples
    private ExtraEdgeSamples: number;
    
    // Stores the total batch size in samples
    private TotalBatchSampleSize: number;
    
    // Stores the total batch size in bytes (without the header)
    private TotalBatchByteSize: number;
    
    // Stores lost/missing samples over time to correct when a sample rate conversion is happening
    private SampleBudget: number;


    constructor(audio: AudioContext, logger: Logging, errorCallback: () => void, beforeDecodeCheck: (length: number) => boolean,  dataReadyCallback: () => void, batchLength: number, extraEdgeLength: number)
    {
        super(audio, logger, errorCallback, beforeDecodeCheck, dataReadyCallback);

        this._OnDecodeSuccess = this.OnDecodeSuccess.bind(this);
        this._OnDecodeError = this.OnDecodeError.bind(this);

        this.BatchLength = batchLength;
        this.ExtraEdgeLength = extraEdgeLength;
            
        this.GotHeader = false;
        this.RiffHeader = null;
        this.WaveSampleRate = 0;
        this.WaveBitsPerSample = 0;
        this.WaveBytesPerSample = 0;
        this.WaveBlockAlign = 0;
        this.WaveChannels = 0;
        this.BatchSamples = 0;
        this.BatchBytes = 0;
        this.ExtraEdgeSamples = 0;
        this.TotalBatchSampleSize = 0;
        this.TotalBatchByteSize = 0;
        this.SampleBudget = 0;
    }

    // Deletes all samples from the databuffer and the samplearray
    public PurgeData(): void {
        super.PurgeData();

        this.SampleBudget = 0;
    }

    // Deletes all data from the reader (deos effect headers, etc.)
    public Reset(): void {
        super.Reset();

        this.GotHeader = false;
        this.RiffHeader = null;
        this.WaveSampleRate = 0;
        this.WaveBitsPerSample = 0;
        this.WaveBytesPerSample = 0;
        this.WaveBlockAlign = 0;
        this.WaveChannels = 0;
        this.BatchSamples = 0;
        this.BatchBytes = 0;
        this.ExtraEdgeSamples = 0;
        this.TotalBatchSampleSize = 0;
        this.TotalBatchByteSize = 0;
        this.SampleBudget = 0;
    }

    protected ExtractAll(): void {
        if (!this.GotHeader)
            this.FindAndExtractHeader();
        else {
            while (this.CanExtractSamples()) {
                // Extract samples
                let tmpSamples: Uint8Array = this.ExtractIntSamples();

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
                let samplesBuffer: Uint8Array = new Uint8Array(this.RiffHeader.length + tmpSamples.length);

                let offset: number = 0;

                // Add header
                samplesBuffer.set(this.RiffHeader, offset);
                offset += this.RiffHeader.length;

                // Add samples
                samplesBuffer.set(tmpSamples, offset);

                // Increment Id
                let id = this.Id++;

                // Push pages to the decoder
                this.Audio.decodeAudioData(samplesBuffer.buffer,
                    (function (decodedData: AudioBuffer) {
                        let _id: number = id;
                        this._OnDecodeSuccess(decodedData, _id);
                    }).bind(this),
                    this._OnDecodeError
                );
            }
        }
    }

    // Finds riff header within the data buffer and extracts it
    private FindAndExtractHeader(): void {
        let curpos: number = 0;
        // Make sure a whole header can fit
        if (!((curpos + 4) < this.DataBuffer.length))
            return;

        // Check chunkID, should be "RIFF"
        if (!(this.DataBuffer[curpos] == 0x52 && this.DataBuffer[curpos + 1] == 0x49 && this.DataBuffer[curpos + 2] == 0x46 && this.DataBuffer[curpos + 3] == 0x46))
            return;

        curpos += 8;

        if (!((curpos + 4) < this.DataBuffer.length))
            return;

        // Check riffType, should be "WAVE"
        if (!(this.DataBuffer[curpos] == 0x57 && this.DataBuffer[curpos + 1] == 0x41 && this.DataBuffer[curpos + 2] == 0x56 && this.DataBuffer[curpos + 3] == 0x45))
            return;

        curpos += 4;

        if (!((curpos + 4) < this.DataBuffer.length))
            return;

        // Check for format subchunk, should be "fmt "
        if (!(this.DataBuffer[curpos] == 0x66 && this.DataBuffer[curpos + 1] == 0x6d && this.DataBuffer[curpos + 2] == 0x74 && this.DataBuffer[curpos + 3] == 0x20))
            return;

        curpos += 4;

        if (!((curpos + 4) < this.DataBuffer.length))
            return;

        let subChunkSize: number = this.DataBuffer[curpos] | this.DataBuffer[curpos + 1] << 8 | this.DataBuffer[curpos + 2] << 16 | this.DataBuffer[curpos + 3] << 24;

        if (!((curpos + 4 + subChunkSize) < this.DataBuffer.length))
            return;

        curpos += 6;

        this.WaveChannels = this.DataBuffer[curpos] | this.DataBuffer[curpos + 1] << 8;

        curpos += 2;

        this.WaveSampleRate = this.DataBuffer[curpos] | this.DataBuffer[curpos + 1] << 8 | this.DataBuffer[curpos + 2] << 16 | this.DataBuffer[curpos + 3] << 24;

        curpos += 8;

        this.WaveBlockAlign = this.DataBuffer[curpos] | this.DataBuffer[curpos + 1] << 8;

        curpos += 2;

        this.WaveBitsPerSample = this.DataBuffer[curpos] | this.DataBuffer[curpos + 1] << 8;

        this.WaveBytesPerSample = this.WaveBitsPerSample / 8;

        curpos += subChunkSize - 14;

        while (true) {
            if ((curpos + 8) < this.DataBuffer.length) {
                subChunkSize = this.DataBuffer[curpos + 4] | this.DataBuffer[curpos + 5] << 8 | this.DataBuffer[curpos + 6] << 16 | this.DataBuffer[curpos + 7] << 24;
                // Check for data subchunk, should be "data"
                if (this.DataBuffer[curpos] == 0x64 && this.DataBuffer[curpos + 1] == 0x61 && this.DataBuffer[curpos + 2] == 0x74 && this.DataBuffer[curpos + 3] == 0x61) // Data chunk found
                    break;
                else
                    curpos += 8 + subChunkSize;
            }
            else
                return;
        }
        curpos += 8;

        this.RiffHeader = new Uint8Array(this.DataBuffer.buffer.slice(0, curpos));

        this.BatchSamples = Math.ceil(this.BatchLength * this.WaveSampleRate);
        this.ExtraEdgeSamples = Math.ceil(this.ExtraEdgeLength * this.WaveSampleRate);

        this.BatchBytes = this.BatchSamples * this.WaveBlockAlign;

        this.TotalBatchSampleSize = (this.BatchSamples + this.ExtraEdgeSamples);
        this.TotalBatchByteSize = this.TotalBatchSampleSize * this.WaveBlockAlign;

        let chunkSize: number = this.RiffHeader.length + this.TotalBatchByteSize - 8;

        // Fix header chunksizes
        this.RiffHeader[4] = chunkSize & 0xFF;
        this.RiffHeader[5] = (chunkSize & 0xFF00) >>> 8;
        this.RiffHeader[6] = (chunkSize & 0xFF0000) >>> 16;
        this.RiffHeader[7] = (chunkSize & 0xFF000000) >>> 24;

        this.RiffHeader[this.RiffHeader.length - 4] = (this.TotalBatchByteSize & 0xFF);
        this.RiffHeader[this.RiffHeader.length - 3] = (this.TotalBatchByteSize & 0xFF00) >>> 8;
        this.RiffHeader[this.RiffHeader.length - 2] = (this.TotalBatchByteSize & 0xFF0000) >>> 16;
        this.RiffHeader[this.RiffHeader.length - 1] = (this.TotalBatchByteSize & 0xFF000000) >>> 24;

        this.GotHeader = true;
    }

    // Checks if there is a samples ready to be extracted
    private CanExtractSamples(): boolean {
        if (this.DataBuffer.length >= this.TotalBatchByteSize)
            return true;
        else
            return false;
    }

    // Extract a single batch of samples from the buffer
    private ExtractIntSamples(): Uint8Array {
        // Extract sample data from buffer
        let intSampleArray: Uint8Array = new Uint8Array(this.DataBuffer.buffer.slice(0, this.TotalBatchByteSize));

        // Remove samples from buffer
        this.DataBuffer = new Uint8Array(this.DataBuffer.buffer.slice(this.BatchBytes));

        return intSampleArray;
    }

    private readonly _OnDecodeSuccess: (decodedData: AudioBuffer, id: number) => void;
    // Is called if the decoding of the samples succeeded
    private OnDecodeSuccess(decodedData: AudioBuffer, id: number): void {
        // Calculate the length of the parts
        let pickSize: number = this.BatchLength * decodedData.sampleRate;

        this.SampleBudget += (pickSize - Math.ceil(pickSize));

        pickSize = Math.ceil(pickSize);

        let pickOffset = (decodedData.length - pickSize) / 2.0;

        if (pickOffset < 0)
            pickOffset = 0; // This should never happen!
        else
            pickOffset = Math.floor(pickOffset);

        if (this.SampleBudget < -1.0) {
            let correction = -1.0 * Math.floor(Math.abs(this.SampleBudget));
            this.SampleBudget -= correction;
            pickSize += correction;
        }
        else if (this.SampleBudget > 1.0) {
            let correction = Math.floor(this.SampleBudget);
            this.SampleBudget -= correction;
            pickSize += correction;
        }

        // Create a buffer that can hold a single part
        let audioBuffer: AudioBuffer = this.Audio.createBuffer(decodedData.numberOfChannels, pickSize, decodedData.sampleRate);

        // Fill buffer with the last part of the decoded frame
        for (let i: number = 0; i < decodedData.numberOfChannels; i++)
            audioBuffer.getChannelData(i).set(decodedData.getChannelData(i).slice(pickOffset, -pickOffset));

        this.OnDataReady(id, audioBuffer);
    }

    private readonly _OnDecodeError: (error: DOMException) => void;
    // Is called in case the decoding of the window fails
    private OnDecodeError(_error: DOMException): void {
        this.ErrorCallback();
    }
}