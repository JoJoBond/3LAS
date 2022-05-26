/*
    RTC live audio is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/


declare class mozRTCPeerConnection extends RTCPeerConnection { }
declare class webkitRTCPeerConnection extends RTCPeerConnection { }

class WebRTC_Settings {
    public AudioTag: HTMLAudioElement;
    public RtcConfig: RTCConfiguration;
}

class WebRTC {
    private readonly Logger: Logging;
    private readonly AudioTag: HTMLAudioElement;

    private RtcPeer: RTCPeerConnection;
    private WebSocket: WebSocketClient;
    private ActivityTimer: number;

    public ActivityCallback: () => void;
    public DisconnectCallback: () => void;

    constructor(logger: Logging, settings: WebRTC_Settings) {
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

    public set Volume(value: number) {
        this.AudioTag.volume = value;
    }

    public get Volume(): number {
        return this.AudioTag.volume;
    }

    public Init(webSocket: WebSocketClient): void {
        this.WebSocket = webSocket;
        this.WebSocket.Send(JSON.stringify({
            "type": "webrtc",
            "data": null
        }));
        this.ActivityTimer = setInterval(this.OnActivityTimerTick.bind(this), 1000);
    }

    private OnActivityTimerTick(): void {
        if ((this.RtcPeer.iceConnectionState == "connected" || this.RtcPeer.iceConnectionState == "completed") && this.ActivityCallback)
            this.ActivityCallback();
    }

    private OnConnectionStateChange(): void {
        if ((this.RtcPeer.iceConnectionState == "closed" ||
            this.RtcPeer.iceConnectionState == "disconnected" ||
            this.RtcPeer.iceConnectionState == "failed") && this.DisconnectCallback)
            this.DisconnectCallback();
    }

    private OnTrack(event: RTCTrackEvent): void {
        if (event.streams != null && event.streams.length > 0)
            this.AudioTag.srcObject = event.streams[0];
        else if (event.track != null)
            this.AudioTag.srcObject = new MediaStream([event.track]);

        this.AudioTag.play();
    }

    public OnSocketError(message: string): void {
    }

    public OnSocketConnect(): void {
    }

    public OnSocketDisconnect(): void {
    }

    public Reset(): void {
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
    }

    public async OnSocketDataReady(data: ArrayBuffer | string): Promise<void> {
        let message = JSON.parse(data.toString());

        if (message.type == "offer") {
            await this.RtcPeer.setRemoteDescription(new RTCSessionDescription(message.data));

            let answer = await this.RtcPeer.createAnswer();

            await this.RtcPeer.setLocalDescription(new RTCSessionDescription(answer));

            this.WebSocket.Send(JSON.stringify({
                "type": "answer",
                "data": answer
            }));
        }
        else if (message.type == "candidate") {
            (async () => await this.RtcPeer.addIceCandidate(message.data))();
        }
    }
}