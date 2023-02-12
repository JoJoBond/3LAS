/// <reference path="../../../client/src/3las.ts" />
/// <reference path="../../../client/src/3las.webrtc.ts" />
/// <reference path="../../../client/src/fallback/3las.fallback.ts" />
/// <reference path="../../../client/src/fallback/3las.formatreader.ts" />
/// <reference path="../../../client/src/fallback/formats/3las.formatreader.mpeg.ts" />
/// <reference path="../../../client/src/fallback/formats/3las.formatreader.wav.ts" />
/// <reference path="../../../client/src/fallback/3las.liveaudioplayer.ts" />
/// <reference path="../../../client/src/util/3las.helpers.ts" />
/// <reference path="../../../client/src/util/3las.logging.ts" />
/// <reference path="../../../client/src/util/3las.websocketclient.ts" />

var Stream: _3LAS;
var DefaultVolume: number = 0.5;
declare var RtcConfig: RTCConfiguration;
declare var SocketPort: number;
declare var SocketPath: string;
declare var AudioTagId: string;

function Init(_ev: Event): void {
    document.getElementById("logwindowbutton").onclick = OnLogWindowButtonClick;

    let logger: Logging = new Logging(document.getElementById("logwindow"), "li");

    // Load default settings
    let settings: _3LAS_Settings = new _3LAS_Settings();

    if (typeof RtcConfig == 'undefined')
        RtcConfig = {};

    settings.WebRTC.RtcConfig = RtcConfig;

    if (typeof SocketPort != 'undefined')
        settings.SocketPort = SocketPort;

    if (typeof SocketPath != 'undefined')
        settings.SocketPath = SocketPath;

    if (typeof AudioTagId == 'undefined')
        settings.WebRTC.AudioTag = null;
    else
        settings.WebRTC.AudioTag = <HTMLAudioElement>document.getElementById(AudioTagId);

    try {
        Stream = new _3LAS(logger, settings);
    }
    catch (_ex) {
        document.getElementById("webaudiounsupported").style.display = "block";
        return;
    }

    Stream.ConnectivityCallback = OnConnectivityCallback;
    Stream.ActivityCallback = OnActivityCallback;

    document.getElementById("unmutebutton").onclick = OnUnmuteButtonClick;
    document.getElementById("mutebutton").onclick = OnMuteButtonClick;
    document.getElementById("playbutton").onclick = OnPlayButtonClick;

    if (isAndroid) {
        let lightbutton: HTMLElement = document.getElementById("lightbutton");
        lightbutton.style.display = "block";

        lightbutton.addEventListener("touchstart", OnLightButtonClick);
        lightbutton.addEventListener("mousedown", OnLightButtonClick);

        let lightoff: HTMLElement = document.getElementById("lightoff");
        lightoff.addEventListener("touchstart", OnLightOffClick, true);
        lightoff.addEventListener("mousedown", OnLightOffClick, true);
    }

    document.getElementById("viewcontainer").style.display = "block";
}

function OnLogWindowButtonClick(_ev: MouseEvent): void {
    let logwindow: HTMLElement = document.getElementById("logwindow");
    logwindow.style.display = (logwindow.style.display == "block" ? "none" : "block")
}

function OnConnectivityCallback(isConnected: boolean): void {
    if (isConnected) {
        let volumebar: HTMLElement = document.getElementById("volumebar");
        if (Stream.CanChangeVolume()) {
            volumebar.addEventListener("touchstart", OnVolumeBarDragBegin);
            volumebar.addEventListener("mousedown", OnVolumeBarDragBegin);
            volumebar.style.visibility = "visible";
        }
        else {
            volumebar.style.display = "none";
            DefaultVolume = 1.0;
            OldVolume = 1.0;
        }

        if (DefaultVolume >= 0) {
            Stream.Volume = DefaultVolume;
            DefaultVolume = -1;
        }

        document.getElementById("controlbar").style.visibility = "visible";
        document.getElementById("playbutton").style.visibility = "hidden";
        document.getElementById("mutebutton").style.visibility = "visible";
        document.getElementById("unmutebutton").style.visibility = "hidden";
    }
    else {
        document.getElementById("volumebar").style.visibility = "hidden";
        document.getElementById("controlbar").style.visibility = "hidden";
        document.getElementById("playbutton").style.visibility = "visible";
        document.getElementById("redlighton").style.visibility = "hidden";
        document.getElementById("redlightoff").style.visibility = "visible";
        document.getElementById("mutebutton").style.visibility = "hidden";
        document.getElementById("unmutebutton").style.visibility = "hidden";
    }
}

function OnActivityCallback(): void {
    let redlighton: HTMLElement = document.getElementById("redlighton");
    let redlightoff: HTMLElement = document.getElementById("redlightoff");

    if (redlightoff.style.visibility == "hidden") {
        redlightoff.style.visibility = "visible";
        redlighton.style.visibility = "hidden";
    }
    else {
        redlightoff.style.visibility = "hidden";
        redlighton.style.visibility = "visible";
    }
}

var OldVolume: number = 0;

function OnMuteButtonClick(_ev: MouseEvent): void {
    document.getElementById("unmutebutton").style.visibility = "visible";
    document.getElementById("mutebutton").style.visibility = "hidden";

    OldVolume = Stream.Volume;
    Stream.Volume = 0.0;

    UpdateVolumeBar(0);
}

function OnUnmuteButtonClick(_ev: MouseEvent): void {
    document.getElementById("mutebutton").style.visibility = "visible";
    document.getElementById("unmutebutton").style.visibility = "hidden";

    Stream.Volume = OldVolume;

    UpdateVolumeBar(OldVolume * document.getElementById("volumebar").getBoundingClientRect().width);
}

function OnPlayButtonClick(_ev: MouseEvent): void {
    try {
        Stream.Start();
    }
    catch (_ex) {
    }
}

function UpdateVolumeBar(left: number): void {
    document.getElementById("volumeknob").style.left = left + "px";
    document.getElementById("currentvolume").style.width = left + "px";
}

function OnVolumeBarDragBegin(ev: MouseEvent | TouchEvent): void {
    document.getElementById("mutebutton").style.visibility = "visible";
    document.getElementById("unmutebutton").style.visibility = "hidden";

    ev.currentTarget.addEventListener("touchmove", OnVolumeBarDragMove);
    ev.currentTarget.addEventListener("mousemove", OnVolumeBarDragMove);

    ev.currentTarget.addEventListener("touchend", OnVolumeBarDragEnd);
    ev.currentTarget.addEventListener("mouseup", OnVolumeBarDragEnd);

    ev.currentTarget.addEventListener("touchcancel", OnVolumeBarDragLeave);
    ev.currentTarget.addEventListener("mouseleave", OnVolumeBarDragLeave);

    OnVolumeBarDragMove(ev);
}

function OnVolumeBarDragEnd(ev: MouseEvent | TouchEvent): void {
    ev.currentTarget.removeEventListener("touchmove", OnVolumeBarDragMove);
    ev.currentTarget.removeEventListener("mousemove", OnVolumeBarDragMove);

    ev.currentTarget.removeEventListener("touchend", OnVolumeBarDragEnd);
    ev.currentTarget.removeEventListener("mouseup", OnVolumeBarDragEnd);

    ev.currentTarget.removeEventListener("touchcancel", OnVolumeBarDragLeave);
    ev.currentTarget.removeEventListener("mouseleave", OnVolumeBarDragLeave);

    OnVolumeBarDragMove(ev);
}

function OnVolumeBarDragLeave(ev: MouseEvent | TouchEvent): void {
    ev.currentTarget.removeEventListener("touchmove", OnVolumeBarDragMove);
    ev.currentTarget.removeEventListener("mousemove", OnVolumeBarDragMove);

    ev.currentTarget.removeEventListener("touchend", OnVolumeBarDragEnd);
    ev.currentTarget.removeEventListener("mouseup", OnVolumeBarDragEnd);

    ev.currentTarget.removeEventListener("touchcancel", OnVolumeBarDragLeave);
    ev.currentTarget.removeEventListener("mouseleave", OnVolumeBarDragLeave);
}

function OnVolumeBarDragMove(ev: MouseEvent | TouchEvent): void {
    let clientX: number;
    if (ev instanceof MouseEvent) {
        clientX = (<MouseEvent>ev).clientX;
    }
    else {
        if ((<TouchEvent>ev).touches.length <= 0)
            return;
        clientX = (<TouchEvent>ev).touches[0].clientX;
    }

    let rect: DOMRect = (<HTMLElement>ev.currentTarget).getBoundingClientRect();

    let left: number = clientX - rect.left;

    if (left < 0)
        left = 0;
    else if (left > rect.width)
        left = rect.width;

    let ratio: number = left / rect.width;

    UpdateVolumeBar(left);

    Stream.Volume = ratio;
}

var lastTapTime: number = -1;

function OnLightButtonClick(ev: MouseEvent | TouchEvent): void {
    let now = (new Date()).getTime();
    let timesince = now - lastTapTime;

    if (timesince > 150 && document.getElementById("lightoff").style.display == "none") {
        document.getElementById("lightoff").style.display = "block";
        document.getElementById("lightbutton").style.filter = "grayscale(100%)";
        document.getElementById("lightbutton").style.opacity = "0.25";
        lastTapTime = -1;
        return;
    } else if (lastTapTime > 0 && timesince > 150 && timesince < 600) {
        document.getElementById("lightoff").style.display = "none";
        document.getElementById("lightbutton").style.filter = "none";
        document.getElementById("lightbutton").style.opacity = "1.0";
    }

    lastTapTime = now;
}

function OnLightOffClick(ev: MouseEvent | TouchEvent): boolean {
    ev.preventDefault();
    ev.stopPropagation();
    ev.cancelBubble = true;
    return true;
}