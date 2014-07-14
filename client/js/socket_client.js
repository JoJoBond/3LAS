/*
	Socket-Client is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/
function WebSocketClient (URI, ErrorCallback, ConnectCallback, DataReadyCallback, DisconnectCallback)
{
	// Used to reference the current instance of this class, within callback functions and methods
	var Self = this;
	
	// Check callback argument
	if (typeof ErrorCallback !== 'function')
		throw new Error('WebSocketClient: ErrorCallback must be specified');
	if (typeof ConnectCallback !== 'function')
		throw new Error('WebSocketClient: ConnectCallback must be specified');
	if (typeof DataReadyCallback !== 'function')
		throw new Error('WebSocketClient: DataReadyCallback must be specified');
	if (typeof DisconnectCallback !== 'function')
		throw new Error('WebSocketClient: DisconnectCallback must be specified');
		
	
	this.ErrorCallback = ErrorCallback;
	this.ConnectCallback = ConnectCallback;
	this.DataReadyCallback = DataReadyCallback;
	this.DisconnectCallback = DisconnectCallback;
	
	
	// Client is not yet connected
	this.IsConnected = false;
	
	// Create socket, connect to URI
	if (typeof WebSocket !== "undefined")
		this.Socket = new WebSocket(URI);
	else if (typeof webkitWebSocket !== "undefined")
		this.Socket = new webkitWebSocket(URI);
	else if (typeof mozWebSocket !== "undefined")
		this.Socket = new mozWebSocket(URI);
	else
		throw new Error('WebSocketClient: Browser does not support "WebSocket".');
	
	// Change connetion status once connected
	this.Socket.addEventListener("open", Socket_OnOpen, false);
	function Socket_OnOpen (event)
	{
		if (Self.Socket.readyState == 1)
		{
			Self.IsConnected = true;
			ConnectCallback();
		}
	}
	
	this.Socket.addEventListener("error", Socket_OnError, false);
	function Socket_OnError (event)
	{
		if (Self.IsConnected == true)
			ErrorCallback("Socket fault.");
		else
			ErrorCallback("Could not connect to server.");
	}
	
	this.Socket.binaryType = 'arraybuffer';
	
	// Change connetion status on disconnect
	this.Socket.addEventListener("close", Socket_OnClose, false);
	function Socket_OnClose (event)
	{
		if (Self.IsConnected == true && (Self.Socket.readyState == 2 || Self.Socket.readyState == 3))
		{
			Self.IsConnected = false;
			DisconnectCallback();
		}
	}
	

	
	// Returns current connection status
	this.GetStatus = GetStatus;
	function GetStatus()
	{
		// Return boolean
		return Self.IsConnected;
	}

	// Handle incomping data
	this.Socket.addEventListener("message", Socket_OnMessage, false);
	function Socket_OnMessage (event)
	{
		// Trigger callback
		Self.DataReadyCallback(event.data);
	}
}
