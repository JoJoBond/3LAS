var _3LAS_Settings = /** @class */ (function () {
    function _3LAS_Settings() {
        this.SocketHost = document.location.hostname ? document.location.hostname : "127.0.0.1";
        this.SocketPort = 8080;
        this.SocketPath = "/";
        this.WebRTC = new WebRTC_Settings();
        this.Fallback = new Fallback_Settings();
    }
    return _3LAS_Settings;
}());
var _3LAS = /** @class */ (function () {
    function _3LAS(logger, settings) {
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
        catch (_a) {
            this.WebRTC = null;
        }
        if (this.WebRTC == null) {
            try {
                this.Fallback = new Fallback(this.Logger, this.Settings.Fallback);
                this.Fallback.ActivityCallback = this.OnActivity.bind(this);
            }
            catch (_b) {
                this.Fallback = null;
            }
        }
        if (this.WebRTC == null && this.Fallback == null) {
            this.Logger.Log('3LAS: Browser does not support either media handling methods.');
            throw new Error();
        }
        if (isAndroid) {
            this.WakeLock = new WakeLock(this.Logger);
        }
    }
    Object.defineProperty(_3LAS.prototype, "Volume", {
        get: function () {
            if (this.WebRTC)
                return this.WebRTC.Volume;
            else
                return this.Fallback.Volume;
        },
        set: function (value) {
            if (this.WebRTC)
                this.WebRTC.Volume = value;
            else
                this.Fallback.Volume = value;
        },
        enumerable: false,
        configurable: true
    });
    _3LAS.prototype.CanChangeVolume = function () {
        if (this.WebRTC)
            return this.WebRTC.CanChangeVolume();
        else
            return true;
    };
    _3LAS.prototype.Start = function () {
        this.ConnectivityFlag = false;
        // This is stupid, but required for iOS/iPadOS... thanks Apple :(
        if (this.Settings && this.Settings.WebRTC && this.Settings.WebRTC.AudioTag)
            this.Settings.WebRTC.AudioTag.play();
        // This is stupid, but required for Android.... thanks Google :(
        if (this.WakeLock)
            this.WakeLock.Begin();
        try {
            this.WebSocket = new WebSocketClient(this.Logger, 'ws://' + this.Settings.SocketHost + ':' + this.Settings.SocketPort.toString() + this.Settings.SocketPath, this.OnSocketError.bind(this), this.OnSocketConnect.bind(this), this.OnSocketDataReady.bind(this), this.OnSocketDisconnect.bind(this));
            this.Logger.Log("Init of WebSocketClient succeeded");
            this.Logger.Log("Trying to connect to server.");
        }
        catch (e) {
            this.Logger.Log("Init of WebSocketClient failed: " + e);
            throw new Error();
        }
    };
    _3LAS.prototype.OnActivity = function () {
        if (this.ActivityCallback)
            this.ActivityCallback();
        if (!this.ConnectivityFlag) {
            this.ConnectivityFlag = true;
            if (this.ConnectivityCallback)
                this.ConnectivityCallback(true);
        }
    };
    // Callback function from socket connection
    _3LAS.prototype.OnSocketError = function (message) {
        this.Logger.Log("Network error: " + message);
        if (this.WebRTC)
            this.WebRTC.OnSocketError(message);
        else
            this.Fallback.OnSocketError(message);
    };
    _3LAS.prototype.OnSocketConnect = function () {
        this.Logger.Log("Established connection with server.");
        if (this.WebRTC)
            this.WebRTC.OnSocketConnect();
        else
            this.Fallback.OnSocketConnect();
        if (this.WebRTC)
            this.WebRTC.Init(this.WebSocket);
        else
            this.Fallback.Init(this.WebSocket);
    };
    _3LAS.prototype.OnSocketDisconnect = function () {
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
    };
    _3LAS.prototype.OnSocketDataReady = function (data) {
        if (this.WebRTC)
            this.WebRTC.OnSocketDataReady(data);
        else
            this.Fallback.OnSocketDataReady(data);
    };
    return _3LAS;
}());
//# sourceMappingURL=3las.js.map