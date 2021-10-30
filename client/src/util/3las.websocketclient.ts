/*
	WebSocket client is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

declare class webkitWebSocket extends WebSocket {}
declare class mozWebSocket extends WebSocket {}

class WebSocketClient {
    private readonly Logger: Logging;
    private readonly Uri: string;
    private readonly ErrorCallback: (message: string) => void;
    private readonly ConnectCallback: () => void;
    private readonly DataReadyCallback: (data: ArrayBuffer) => void;
    private readonly DisconnectCallback: () => void;

    private IsConnected: boolean;
    private Socket: WebSocket;

    constructor(logger: Logging, uri: string, errorCallback: (message: string) => void, connectCallback: () => void, dataReadyCallback: (data: ArrayBuffer) => void, disconnectCallback: () => void) {
        this.Logger = logger;
        this.Uri = uri;

        // Check callback argument
        if (typeof errorCallback !== 'function')
            throw new Error('WebSocketClient: ErrorCallback must be specified');
        if (typeof connectCallback !== 'function')
            throw new Error('WebSocketClient: ConnectCallback must be specified');
        if (typeof dataReadyCallback !== 'function')
            throw new Error('WebSocketClient: DataReadyCallback must be specified');
        if (typeof disconnectCallback !== 'function')
            throw new Error('WebSocketClient: DisconnectCallback must be specified');

        this.ErrorCallback = errorCallback;
        this.ConnectCallback = connectCallback;
        this.DataReadyCallback = dataReadyCallback;
        this.DisconnectCallback = disconnectCallback;

        // Client is not yet connected
        this.IsConnected = false;
        
        // Create socket, connect to URI
        if (typeof WebSocket !== "undefined")
            this.Socket = new WebSocket(this.Uri);
        else if (typeof webkitWebSocket !== "undefined")
            this.Socket = new webkitWebSocket(this.Uri);
        else if (typeof mozWebSocket !== "undefined")
            this.Socket = new mozWebSocket(this.Uri);
        else
            throw new Error('WebSocketClient: Browser does not support "WebSocket".');
        
        this.Socket.binaryType = 'arraybuffer';

        this.Socket.addEventListener("open", this.OnOpen.bind(this));
        this.Socket.addEventListener("error", this.OnError.bind(this));
        this.Socket.addEventListener("close", this.OnClose.bind(this));
        this.Socket.addEventListener("message", this.OnMessage.bind(this));
    }

    public get Connected(): boolean {
        return this.IsConnected;
    }

    public Send(message: string):void {
        if(!this.IsConnected)
            return;

        this.Socket.send(message);
    }

    // Handle errors
    private OnError(_ev: Event): void {
        if (this.IsConnected == true)
            this.ErrorCallback("Socket fault.");
        else
            this.ErrorCallback("Could not connect to server.");
    }

    // Change connetion status once connected
    private OnOpen(_ev: Event): void {
        if (this.Socket.readyState == 1) {
            this.IsConnected = true;
            this.ConnectCallback();
        }
    }

    // Change connetion status on disconnect
    private OnClose(_ev: CloseEvent): void {
        if (this.IsConnected == true && (this.Socket.readyState == 2 || this.Socket.readyState == 3)) {
            this.IsConnected = false;
            this.DisconnectCallback();
        }
    }

    // Handle incomping data
    private OnMessage(ev: MessageEvent): void {
        // Trigger callback
        this.DataReadyCallback(<ArrayBuffer>ev.data);
    }
}