/*
	Socket-Client is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

function WebSocketClient (URI, ErrorCallback, ConnectCallback, DataReadyCallback, DisconnectCallback)
{
	// Check callback argument
	if (typeof ErrorCallback !== 'function')
		throw new Error('WebSocketClient: ErrorCallback must be specified');
	if (typeof ConnectCallback !== 'function')
		throw new Error('WebSocketClient: ConnectCallback must be specified');
	if (typeof DataReadyCallback !== 'function')
		throw new Error('WebSocketClient: DataReadyCallback must be specified');
	if (typeof DisconnectCallback !== 'function')
		throw new Error('WebSocketClient: DisconnectCallback must be specified');
		
	this._ErrorCallback = ErrorCallback;
	this._ConnectCallback = ConnectCallback;
	this._DataReadyCallback = DataReadyCallback;
	this._DisconnectCallback = DisconnectCallback;
		
	// Client is not yet connected
	this._IsConnected = false;
	
	// Create socket, connect to URI
	if (typeof WebSocket !== "undefined")
		this._Socket = new WebSocket(URI);
	else if (typeof webkitWebSocket !== "undefined")
		this._Socket = new webkitWebSocket(URI);
	else if (typeof mozWebSocket !== "undefined")
		this._Socket = new mozWebSocket(URI);
	else
		throw new Error('WebSocketClient: Browser does not support "WebSocket".');
	
    this._Socket.addEventListener("open", this.__Socket_OnOpen.bind(this), false);
    this._Socket.addEventListener("error", this.__Socket_OnError.bind(this), false);
    this._Socket.addEventListener("close", this.__Socket_OnClose.bind(this), false);
    this._Socket.addEventListener("message", this.__Socket_OnMessage.bind(this), false);

    this._Socket.binaryType = 'arraybuffer';
}


// Pubic methods (external functions):
// ===================================

// Returns current connection status
WebSocketClient.prototype.GetStatus = function () {
    // Return boolean
    return this._IsConnected;
};


// Internal callback functions
// ===========================

// Handle errors
WebSocketClient.prototype.__Socket_OnError = function (event) {
    if (this._IsConnected == true)
        this._ErrorCallback("Socket fault.");
    else
        this._ErrorCallback("Could not connect to server.");
};

// Change connetion status once connected
WebSocketClient.prototype.__Socket_OnOpen = function (event) {
    if (this._Socket.readyState == 1) {
        this._IsConnected = true;
        this._ConnectCallback();
    }
};

// Change connetion status on disconnect
WebSocketClient.prototype.__Socket_OnClose = function (event) {
    if (this._IsConnected == true && (this._Socket.readyState == 2 || this._Socket.readyState == 3)) {
        this._IsConnected = false;
        this._DisconnectCallback();
    }
};

// Handle incomping data
WebSocketClient.prototype.__Socket_OnMessage = function (event) {
    // Trigger callback
    this._DataReadyCallback(event.data);
};