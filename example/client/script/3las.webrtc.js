/*
    RTC live audio is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var WebRTC_Settings = /** @class */ (function () {
    function WebRTC_Settings() {
    }
    return WebRTC_Settings;
}());
var WebRTC = /** @class */ (function () {
    function WebRTC(logger, settings) {
        this.Logger = logger;
        if (!this.Logger) {
            this.Logger = new Logging(null, null);
        }
        this.AudioTag = settings.AudioTag;
        // Create RTC peer connection
        if (typeof RTCPeerConnection !== "undefined")
            this.RtcPeer = new RTCPeerConnection(settings.RtcConfig);
        else if (typeof webkitRTCPeerConnection !== "undefined")
            this.RtcPeer = new webkitRTCPeerConnection(settings.RtcConfig);
        else if (typeof mozRTCPeerConnection !== "undefined")
            this.RtcPeer = new mozRTCPeerConnection(settings.RtcConfig);
        else {
            this.Logger.Log('3LAS: Browser does not support "WebRTC".');
            throw new Error();
        }
        this.Logger.Log("Using WebRTC");
        this.RtcPeer.addTransceiver('audio');
        this.RtcPeer.ontrack = this.OnTrack.bind(this);
        this.RtcPeer.oniceconnectionstatechange = this.OnConnectionStateChange.bind(this);
    }
    Object.defineProperty(WebRTC.prototype, "Volume", {
        get: function () {
            if (!this.CanChangeVolume()) {
                if (this.AudioTag.muted == true)
                    return 0.0;
                else
                    return 1.0;
            }
            return this.AudioTag.volume;
        },
        set: function (value) {
            if (!this.CanChangeVolume()) {
                if (value <= 0.0)
                    this.AudioTag.muted = true;
                else
                    this.AudioTag.muted = false;
                return;
            }
            this.AudioTag.volume = value;
        },
        enumerable: false,
        configurable: true
    });
    WebRTC.prototype.CanChangeVolume = function () {
        return !(isIOS || isIPadOS);
    };
    WebRTC.prototype.Init = function (webSocket) {
        this.WebSocket = webSocket;
        this.WebSocket.Send(JSON.stringify({
            "type": "webrtc",
            "data": null
        }));
        this.ActivityTimer = setInterval(this.OnActivityTimerTick.bind(this), 1000);
    };
    WebRTC.prototype.OnActivityTimerTick = function () {
        if ((this.RtcPeer.iceConnectionState == "connected" || this.RtcPeer.iceConnectionState == "completed") && this.ActivityCallback)
            this.ActivityCallback();
    };
    WebRTC.prototype.OnConnectionStateChange = function () {
        if ((this.RtcPeer.iceConnectionState == "closed" ||
            this.RtcPeer.iceConnectionState == "disconnected" ||
            this.RtcPeer.iceConnectionState == "failed") && this.DisconnectCallback)
            this.DisconnectCallback();
    };
    WebRTC.prototype.OnTrack = function (event) {
        if (event.streams != null && event.streams.length > 0)
            this.AudioTag.srcObject = event.streams[0];
        else if (event.track != null)
            this.AudioTag.srcObject = new MediaStream([event.track]);
        this.AudioTag.play();
    };
    WebRTC.prototype.OnSocketError = function (message) {
    };
    WebRTC.prototype.OnSocketConnect = function () {
    };
    WebRTC.prototype.OnSocketDisconnect = function () {
    };
    WebRTC.prototype.Reset = function () {
        if (this.ActivityTimer) {
            clearInterval(this.ActivityTimer);
            this.ActivityTimer = 0;
        }
        if (this.RtcPeer) {
            this.RtcPeer.close();
            delete this.RtcPeer;
            this.RtcPeer = null;
        }
        this.WebSocket = null;
    };
    WebRTC.prototype.OnSocketDataReady = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var message, answer;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        message = JSON.parse(data.toString());
                        if (!(message.type == "offer")) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.RtcPeer.setRemoteDescription(new RTCSessionDescription(message.data))];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.RtcPeer.createAnswer()];
                    case 2:
                        answer = _a.sent();
                        return [4 /*yield*/, this.RtcPeer.setLocalDescription(new RTCSessionDescription(answer))];
                    case 3:
                        _a.sent();
                        this.WebSocket.Send(JSON.stringify({
                            "type": "answer",
                            "data": answer
                        }));
                        return [3 /*break*/, 5];
                    case 4:
                        if (message.type == "candidate") {
                            (function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, this.RtcPeer.addIceCandidate(message.data)];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            }); }); })();
                        }
                        _a.label = 5;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return WebRTC;
}());
//# sourceMappingURL=3las.webrtc.js.map