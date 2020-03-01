declare class webkitAudioContext extends AudioContext {}
declare class mozAudioContext extends AudioContext {}

class _3LAS_Settings {
    public SocketHost: string;
    public Formats: Array<{Mime: string, Port: number}>;
    public MaxVolume: number;
    public InitialBufferLength: number;
    public AutoCorrectSpeed: boolean;

    constructor(){
        this.SocketHost = document.location.hostname ? document.location.hostname : "127.0.0.1";
        this.Formats = new Array();
        this.MaxVolume = 1.0;
        this.AutoCorrectSpeed = false;
        this.InitialBufferLength = 1.0 / 3.0;
    }
}

class _3LAS {
    private readonly Audio: AudioContext;

    private readonly Logger: Logging;

    private readonly Settings: _3LAS_Settings;
    private readonly FormatReader: IAudioFormatReader;
    private readonly Player: LiveAudioPlayer;

    private readonly SelectedMime: string;
    private readonly SelectedPort: number;

    private WebSocket: WebSocketClient;

    public SocketActivityCallback: () => void;
    public SocketConnectivityCallback: (isConnected: boolean) => void;

    constructor(logger: Logging, settings: _3LAS_Settings) {
        this.Logger = logger;
        if(!this.Logger) {
            this.Logger = new Logging(null, null);
        }

        this.Settings = settings;

        // Create audio context
        if (typeof AudioContext !== "undefined")
            this.Audio = new AudioContext();
        else if (typeof webkitAudioContext !== "undefined")
            this.Audio = new webkitAudioContext();	
        else if (typeof mozAudioContext !== "undefined")
            this.Audio = new mozAudioContext();
        else {
            this.Logger.Log('3LAS: Browser does not support "AudioContext".');
            throw new Error();
        }

        this.Logger.Log("Detected: " + 
            (OSName == "MacOSX" ? "Mac OSX": (OSName == "Unknown" ? "Unknown OS" : OSName)) + ", " +
            (BrowserName == "IE" ? "Internet Explorer" : (BrowserName == "NativeChrome" ? "Chrome legacy" : (BrowserName == "Unknown" ? "Unknown Browser" : BrowserName))));

        this.SelectedMime = "";
        this.SelectedPort = 0;

        for (let i: number = 0; i < this.Settings.Formats.length; i++)
        {
            if(!AudioFormatReader.CanDecodeTypes([this.Settings.Formats[i].Mime]))
                continue;

            this.SelectedMime = this.Settings.Formats[i].Mime;
            this.SelectedPort = this.Settings.Formats[i].Port;
            break;
        }

        if (this.SelectedMime == "" || this.SelectedPort == 0)
        {
            this.Logger.Log("None of the available MIME types are supported.");
            throw new Error();
        }
        
        this.Logger.Log("Using MIME: " + this.SelectedMime + " on port: " + this.SelectedPort.toString());

        
        try
        {
            this.Player = new LiveAudioPlayer(
                this.Audio,
                this.Logger,
                this.Settings.MaxVolume,
                this.Settings.InitialBufferLength,
                this.Settings.AutoCorrectSpeed
            );
            this.Logger.Log("Init of LiveAudioPlayer succeeded");
        }
        catch (e)
        {
            this.Logger.Log("Init of LiveAudioPlayer failed: " + e);
            throw new Error();
        }

        try
        {
            this.FormatReader = AudioFormatReader.Create(
                this.SelectedMime,
                this.Audio,
                this.Logger,
                this.OnReaderError.bind(this),
                this.Player.CheckBeforeDecode,
                this.OnReaderDataReady.bind(this),
                AudioFormatReader.DefaultSettings()
            );
            this.Logger.Log("Init of AudioFormatReader succeeded");
        }
        catch (e)
        {
            this.Logger.Log("Init of AudioFormatReader failed: " + e);
            throw new Error();
        }

        this.PacketModCounter = 0;
        this.LastCheckTime = 0;
        this.FocusChecker = 0;
    }

    public Start(): void {
        this.MobileUnmute();

        try
        {
            this.WebSocket = new WebSocketClient(
                this.Logger,
                'ws://' + this.Settings.SocketHost + ':' + this.SelectedPort.toString(),
                this.OnSocketError.bind(this),
                this.OnSocketConnect.bind(this),
                this.OnSocketDataReady.bind(this),
                this.OnSocketDisconnect.bind(this)
            );
            this.Logger.Log("Init of WebSocketClient succeeded");
            this.Logger.Log("Trying to connect to server.");
        }
        catch (e)
        {
            this.Logger.Log("Init of WebSocketClient failed: " + e);
            throw new Error();
        }
    }

    public MobileUnmute(): void {
        let amplification = this.Audio.createGain();

        // Set volume to max
        amplification.gain.value = 1.0;
        
        // Connect gain node to context
        amplification.connect(this.Audio.destination);

        // Create one second buffer with silence		
        let audioBuffer = this.Audio.createBuffer(2, this.Audio.sampleRate, this.Audio.sampleRate);
    
        // Create new audio source for the buffer
        let sourceNode = this.Audio.createBufferSource();
    
        // Make sure the node deletes itself after playback
        sourceNode.onended = function (_ev: Event) {
            sourceNode.disconnect();
            amplification.disconnect();
        };
    
        // Pass audio data to source
        sourceNode.buffer = audioBuffer;
    
        // Connect the source to the gain node
        sourceNode.connect(amplification);
    
        // Play source		
        sourceNode.start();
    }

    public set Volume(value: number) {
        this.Player.Volume = value * this.Settings.MaxVolume;
    }

    public get Volume(): number {
        return this.Player.Volume / this.Settings.MaxVolume;
    }

    // Callback functions from format reader
    private OnReaderError(): void
    {			
        this.Logger.Log("Reader error: Decoding failed.");
    }
    
    private OnReaderDataReady(): void
    {
        while (this.FormatReader.SamplesAvailable())
        {
            this.Player.PushBuffer(this.FormatReader.PopSamples());
        }
    }

    // Callback function from socket connection
    private OnSocketError(message: string): void
    {
        this.Logger.Log("Network error: " + message);
    }
    
    private OnSocketConnect(): void
    {
        this.StartFocusChecker();
        
        this.Logger.Log("Established connection with server.");

        if(this.SocketConnectivityCallback)
            this.SocketConnectivityCallback(true);
    }
    
    private OnSocketDisconnect(): void
    {
        this.StopFocusChecker();
        this.FormatReader.Reset();
        this.Player.Reset();

        this.Logger.Log("Lost connection to server.");

        if(this.SocketConnectivityCallback)
            this.SocketConnectivityCallback(false);
        
        this.Start();
    }
    
    private PacketModCounter: number;
    private OnSocketDataReady(data: ArrayBuffer): void
    {
        this.PacketModCounter++;
        
        if (this.PacketModCounter > 100)
        {
            if(this.SocketActivityCallback)
                this.SocketActivityCallback();
            this.PacketModCounter = 0;
        }

        this.FormatReader.PushData(new Uint8Array(data));
    }


    // Check if page has lost focus (e.g. switching apps on mobile)
    private LastCheckTime: number;
    private FocusChecker: number;
    
    private StartFocusChecker(): void
    {
        if (!this.FocusChecker)
        {
            this.LastCheckTime = Date.now();
            this.FocusChecker = window.setInterval(this.CheckFocus.bind(this), 2000);
        }
    }
    
    private StopFocusChecker(): void
    {
        if (this.FocusChecker)
        {
            window.clearInterval(this.FocusChecker);
            this.FocusChecker = 0;
        }
    }
    
    private CheckFocus(): void
    {
        let checkTime: number = Date.now();
        // Check if focus was lost
        if (checkTime - this.LastCheckTime > 10000)
        {
            // If so, drop all samples in the buffer
            this.Logger.Log("Focus lost, purging format reader.")
            this.FormatReader.PurgeData();
        }
        this.LastCheckTime = checkTime;
    }
}