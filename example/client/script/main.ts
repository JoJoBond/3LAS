/// <reference path="../../../client/src/3las.ts" />
/// <reference path="../../../client/src/3las.formatreader.ts" />
/// <reference path="../../../client/src/formats/3las.formatreader.mpeg.ts" />
/// <reference path="../../../client/src/formats/3las.formatreader.ogg.ts" />
/// <reference path="../../../client/src/formats/3las.formatreader.wav.ts" />
/// <reference path="../../../client/src/formats/3las.formatreader.pcm.ts" />
/// <reference path="../../../client/src/3las.helpers.ts" />
/// <reference path="../../../client/src/3las.liveaudioplayer.ts" />
/// <reference path="../../../client/src/3las.logging.ts" />
/// <reference path="../../../client/src/3las.websocketclient.ts" />

var Stream: _3LAS;
declare var Formats: Array<{Mime: string, Port: number}>;

function Init(_ev: Event): void {
    document.getElementById("logwindowbutton").onclick = OnLogWindowButtonClick;

    let logger: Logging = new Logging(document.getElementById("logwindow"), "li");

    if (typeof WebSocket === "undefined" && typeof webkitWebSocket === "undefined" && typeof mozWebSocket === "undefined")
    {
        document.getElementById("socketsunsupported").style.display = "block";
        return;
    }
    
    if (typeof AudioContext === "undefined" && typeof webkitAudioContext === "undefined" && typeof mozAudioContext === "undefined")
    {
        document.getElementById("webaudiounsupported").style.display = "block";
        return;
    }

    // Load default settings
    let settings: _3LAS_Settings = new _3LAS_Settings();
    // Get format settings from global variable
    settings.Formats = Formats;
    
    // Format settings, first entry has priority
    // Mp3 
    //settings.Formats.push({ "Mime": "audio/mpeg", "Port": 9601 });
    // Wav 
    //settings.Formats.push({ "Mime": "audio/wav", "Port": 9602 });
    // PCM
    //settings.Formats.push({ "Mime": "audio/pcm;rate=16000;channels=1;bits=8", "Port": 9603 });
    // Ogg vorbis (beta stage)
    //settings.Formats.push({ "Mime": "audio/ogg; codecs=vorbis", "Port": 9604 });
	// Ogg opus (alpha stage)
    //settings.Formats.push({ "Mime": "audio/ogg; codecs=opus", "Port": 9604 });

    try{
        Stream = new _3LAS(logger, settings);
    }
    catch(_ex){
        document.getElementById("webaudiounsupported").style.display = "block";
        return;
    }

    Stream.Volume = 0.5;
    Stream.SocketConnectivityCallback = OnSocketConnectivityCallback;
    Stream.SocketActivityCallback = OnSocketActivityCallback;
    
    document.getElementById("unmutebutton").onclick = OnUnmuteButtonClick;
    document.getElementById("mutebutton").onclick = OnMuteButtonClick;
    document.getElementById("playbutton").onclick = OnPlayButtonClick;

    let volumebar: HTMLElement = document.getElementById("volumebar");
    volumebar.addEventListener("touchstart", OnVolumeBarDragBegin);
    volumebar.addEventListener("mousedown", OnVolumeBarDragBegin);
    
    document.getElementById("viewcontainer").style.display = "block";
}

function OnLogWindowButtonClick(_ev: MouseEvent): void {
    let logwindow: HTMLElement = document.getElementById("logwindow");
    logwindow.style.display = (logwindow.style.display == "block" ? "none" : "block")
}

function OnSocketConnectivityCallback(isConnected: boolean): void {
    if (isConnected) {
        document.getElementById("volumebar").style.visibility = "visible";
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

function OnSocketActivityCallback(): void {
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
    try{
        Stream.Start();
    }
    catch(_ex){
    }
}

function UpdateVolumeBar(left: number): void {
    document.getElementById("volumeknob").style.left = left + "px";
    document.getElementById("currentvolume").style.width = left + "px";
}

function OnVolumeBarDragBegin (ev: MouseEvent|TouchEvent): void {
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

function OnVolumeBarDragEnd(ev: MouseEvent|TouchEvent): void {
    ev.currentTarget.removeEventListener("touchmove", OnVolumeBarDragMove);
    ev.currentTarget.removeEventListener("mousemove", OnVolumeBarDragMove);
    
    ev.currentTarget.removeEventListener("touchend", OnVolumeBarDragEnd);
    ev.currentTarget.removeEventListener("mouseup", OnVolumeBarDragEnd);
    
    ev.currentTarget.removeEventListener("touchcancel", OnVolumeBarDragLeave);
    ev.currentTarget.removeEventListener("mouseleave", OnVolumeBarDragLeave);
    
    OnVolumeBarDragMove(ev);
}

function OnVolumeBarDragLeave(ev: MouseEvent|TouchEvent): void {
    ev.currentTarget.removeEventListener("touchmove", OnVolumeBarDragMove);
    ev.currentTarget.removeEventListener("mousemove", OnVolumeBarDragMove);
    
    ev.currentTarget.removeEventListener("touchend", OnVolumeBarDragEnd);
    ev.currentTarget.removeEventListener("mouseup", OnVolumeBarDragEnd);
    
    ev.currentTarget.removeEventListener("touchcancel", OnVolumeBarDragLeave);
    ev.currentTarget.removeEventListener("mouseleave", OnVolumeBarDragLeave);
}

function OnVolumeBarDragMove(ev: MouseEvent|TouchEvent): void {
    let clientX: number;
    if(ev instanceof MouseEvent) {
        clientX = (<MouseEvent>ev).clientX;
    }
    else {
        if( (<TouchEvent>ev).touches.length <= 0)
            return;
        clientX = (<TouchEvent>ev).touches[0].clientX;
    }
    
    let rect: DOMRect = (<HTMLElement>ev.currentTarget).getBoundingClientRect();

    let left: number = clientX - rect.left;

    if(left <0)
        left = 0;
    else if (left > rect.width)
        left = rect.width;

    let ratio: number = left / rect.width;

    UpdateVolumeBar(left);

    Stream.Volume = ratio;
}