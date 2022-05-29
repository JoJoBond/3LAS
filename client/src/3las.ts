class _3LAS_Settings {
    public SocketHost: string;
    public SocketPort: number;
    public SocketPath: string;
    public WebRTC: WebRTC_Settings
    public Fallback: Fallback_Settings;

    constructor() {
        this.SocketHost = document.location.hostname ? document.location.hostname : "127.0.0.1";
        this.SocketPort = 8080;
        this.SocketPath = "/";
        this.WebRTC = new WebRTC_Settings();
        this.Fallback = new Fallback_Settings();
    }
}

class _3LAS {
    public ActivityCallback: () => void;
    public ConnectivityCallback: (status: boolean) => void;

    private readonly Logger: Logging;
    private readonly Settings: _3LAS_Settings;

    private WebSocket: WebSocketClient;
    private ConnectivityFlag: boolean;

    private readonly WebRTC: WebRTC;
    private readonly Fallback: Fallback;

    constructor(logger: Logging, settings: _3LAS_Settings) {
        this.Logger = logger;
        if (!this.Logger) {
            this.Logger = new Logging(null, null);
        }

        this.Settings = settings;

        try {
            this.WebRTC = new WebRTC(this.Logger, this.Settings.WebRTC);
            this.WebRTC.ActivityCallback = this.OnActivity.bind(this);
            this.WebRTC.DisconnectCallback = this.OnSocketDisconnect.bind(this);
        }
        catch
        {
            this.WebRTC = null;
        }

        if (this.WebRTC == null) {
            try {
                this.Fallback = new Fallback(this.Logger, this.Settings.Fallback);
                this.Fallback.ActivityCallback = this.OnActivity.bind(this);
            }
            catch
            {
                this.Fallback = null;
            }
        }

        if (this.WebRTC == null && this.Fallback == null) {
            this.Logger.Log('3LAS: Browser does not support either media handling methods.');
            throw new Error();
        }
    }

    public set Volume(value: number) {
        if (this.WebRTC)
            this.WebRTC.Volume = value;
        else
            this.Fallback.Volume = value;
    }

    public get Volume(): number {
        if (this.WebRTC)
            return this.WebRTC.Volume;
        else
            return this.Fallback.Volume;
    }

    public Start(): void {
        this.ConnectivityFlag = false;

        // This is stupid, but required for iOS/iPadOS... thanks Apple :(
        if(this.Settings && this.Settings.WebRTC && this.Settings.WebRTC.AudioTag)
            this.Settings.WebRTC.AudioTag.play();
        
        try {
            this.WebSocket = new WebSocketClient(
                this.Logger,
                'ws://' + this.Settings.SocketHost + ':' + this.Settings.SocketPort.toString() + this.Settings.SocketPath,
                this.OnSocketError.bind(this),
                this.OnSocketConnect.bind(this),
                this.OnSocketDataReady.bind(this),
                this.OnSocketDisconnect.bind(this)
            );
            this.Logger.Log("Init of WebSocketClient succeeded");
            this.Logger.Log("Trying to connect to server.");
        }
        catch (e) {
            this.Logger.Log("Init of WebSocketClient failed: " + e);
            throw new Error();
        }
    }

    private OnActivity(): void {
        if (this.ActivityCallback)
            this.ActivityCallback();

        if (!this.ConnectivityFlag) {
            this.ConnectivityFlag = true;

            if (this.ConnectivityCallback)
                this.ConnectivityCallback(true);
        }
    }

    // Callback function from socket connection
    private OnSocketError(message: string): void {
        this.Logger.Log("Network error: " + message);

        if (this.WebRTC)
            this.WebRTC.OnSocketError(message);
        else
            this.Fallback.OnSocketError(message);
    }

    private OnSocketConnect(): void {
        this.Logger.Log("Established connection with server.");

        if (this.WebRTC)
            this.WebRTC.OnSocketConnect();
        else
            this.Fallback.OnSocketConnect();


        if (this.WebRTC)
            this.WebRTC.Init(this.WebSocket);
        else
            this.Fallback.Init(this.WebSocket);
    }

    private OnSocketDisconnect(): void {
        this.Logger.Log("Lost connection to server.");

        if (this.WebRTC)
            this.WebRTC.OnSocketDisconnect();
        else
            this.Fallback.OnSocketDisconnect();

        if (this.WebRTC)
            this.WebRTC.Reset();
        else
            this.Fallback.Reset();


        if (this.ConnectivityFlag) {
            this.ConnectivityFlag = false;

            if (this.ConnectivityCallback)
                this.ConnectivityCallback(false);
        }

        this.Start();
    }

    private OnSocketDataReady(data: ArrayBuffer | string): void {
        if (this.WebRTC)
            this.WebRTC.OnSocketDataReady(data);
        else
            this.Fallback.OnSocketDataReady(<ArrayBuffer>data);
    }
}