var _3LAS_Settings = /** @class */ (function () {
    function _3LAS_Settings() {
        this.SocketHost = document.location.hostname ? document.location.hostname : "127.0.0.1";
        this.Formats = new Array();
        this.MaxVolume = 1.0;
        this.AutoCorrectSpeed = false;
        this.InitialBufferLength = 1.0 / 3.0;
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
            (OSName == "MacOSX" ? "Mac OSX" : (OSName == "Unknown" ? "Unknown OS" : OSName)) + ", " +
            (BrowserName == "IE" ? "Internet Explorer" : (BrowserName == "NativeChrome" ? "Chrome legacy" : (BrowserName == "Unknown" ? "Unknown Browser" : BrowserName))));
        this.SelectedMime = "";
        this.SelectedPort = 0;
        for (var i = 0; i < this.Settings.Formats.length; i++) {
            if (!AudioFormatReader.CanDecodeTypes([this.Settings.Formats[i].Mime]))
                continue;
            this.SelectedMime = this.Settings.Formats[i].Mime;
            this.SelectedPort = this.Settings.Formats[i].Port;
            break;
        }
        if (this.SelectedMime == "" || this.SelectedPort == 0) {
            this.Logger.Log("None of the available MIME types are supported.");
            throw new Error();
        }
        this.Logger.Log("Using MIME: " + this.SelectedMime + " on port: " + this.SelectedPort.toString());
        try {
            this.Player = new LiveAudioPlayer(this.Audio, this.Logger, this.Settings.MaxVolume, this.Settings.InitialBufferLength, this.Settings.AutoCorrectSpeed);
            this.Logger.Log("Init of LiveAudioPlayer succeeded");
        }
        catch (e) {
            this.Logger.Log("Init of LiveAudioPlayer failed: " + e);
            throw new Error();
        }
        try {
            this.FormatReader = AudioFormatReader.Create(this.SelectedMime, this.Audio, this.Logger, this.OnReaderError.bind(this), this.OnReaderDataReady.bind(this), AudioFormatReader.DefaultSettings());
            this.Logger.Log("Init of AudioFormatReader succeeded");
        }
        catch (e) {
            this.Logger.Log("Init of AudioFormatReader failed: " + e);
            throw new Error();
        }
        this.PacketModCounter = 0;
        this.LastCheckTime = 0;
        this.FocusChecker = 0;
    }
    _3LAS.prototype.Start = function () {
        this.MobileUnmute();
        try {
            this.WebSocket = new WebSocketClient(this.Logger, 'ws://' + this.Settings.SocketHost + ':' + this.SelectedPort.toString(), this.OnSocketError.bind(this), this.OnSocketConnect.bind(this), this.OnSocketDataReady.bind(this), this.OnSocketDisconnect.bind(this));
            this.Logger.Log("Init of WebSocketClient succeeded");
            this.Logger.Log("Trying to connect to server.");
        }
        catch (e) {
            this.Logger.Log("Init of WebSocketClient failed: " + e);
            throw new Error();
        }
    };
    _3LAS.prototype.MobileUnmute = function () {
        var amplification = this.Audio.createGain();
        // Set volume to max
        amplification.gain.value = 1.0;
        // Connect gain node to context
        amplification.connect(this.Audio.destination);
        // Create one second buffer with silence		
        var audioBuffer = this.Audio.createBuffer(2, this.Audio.sampleRate, this.Audio.sampleRate);
        // Create new audio source for the buffer
        var sourceNode = this.Audio.createBufferSource();
        // Make sure the node deletes itself after playback
        sourceNode.onended = function (_ev) {
            sourceNode.disconnect();
            amplification.disconnect();
        };
        // Pass audio data to source
        sourceNode.buffer = audioBuffer;
        // Connect the source to the gain node
        sourceNode.connect(amplification);
        // Play source		
        sourceNode.start();
    };
    Object.defineProperty(_3LAS.prototype, "Volume", {
        get: function () {
            return this.Player.Volume / this.Settings.MaxVolume;
        },
        set: function (value) {
            this.Player.Volume = value * this.Settings.MaxVolume;
        },
        enumerable: true,
        configurable: true
    });
    // Callback functions from format reader
    _3LAS.prototype.OnReaderError = function () {
        this.Logger.Log("Reader error: Decoding failed.");
    };
    _3LAS.prototype.OnReaderDataReady = function () {
        while (this.FormatReader.SamplesAvailable()) {
            this.Player.PushBuffer(this.FormatReader.PopSamples());
        }
    };
    // Callback function from socket connection
    _3LAS.prototype.OnSocketError = function (message) {
        this.Logger.Log("Network error: " + message);
    };
    _3LAS.prototype.OnSocketConnect = function () {
        if (this.SocketConnectivityCallback)
            this.SocketConnectivityCallback(true);
        this.StartFocusChecker();
        this.Logger.Log("Established connection with server.");
    };
    _3LAS.prototype.OnSocketDisconnect = function () {
        if (this.SocketConnectivityCallback)
            this.SocketConnectivityCallback(false);
        this.StopFocusChecker();
        this.Logger.Log("Lost connection to server.");
    };
    _3LAS.prototype.OnSocketDataReady = function (data) {
        this.PacketModCounter++;
        if (this.PacketModCounter > 100) {
            if (this.SocketActivityCallback)
                this.SocketActivityCallback();
            this.PacketModCounter = 0;
        }
        this.FormatReader.PushData(new Uint8Array(data));
    };
    _3LAS.prototype.StartFocusChecker = function () {
        if (!this.FocusChecker) {
            this.LastCheckTime = Date.now();
            this.FocusChecker = window.setInterval(this.CheckFocus.bind(this), 2000);
        }
    };
    _3LAS.prototype.StopFocusChecker = function () {
        if (this.FocusChecker) {
            window.clearInterval(this.FocusChecker);
            this.FocusChecker = 0;
        }
    };
    _3LAS.prototype.CheckFocus = function () {
        var checkTime = Date.now();
        // Check if focus was lost
        if (checkTime - this.LastCheckTime > 10000) {
            // If so, drop all samples in the buffer
            this.Logger.Log("Focus lost, purging format reader.");
            this.FormatReader.PurgeData();
        }
        this.LastCheckTime = checkTime;
    };
    return _3LAS;
}());
//# sourceMappingURL=3las.js.map