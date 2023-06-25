/*
    Helpers is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/

import { Logging } from './3las.logging';

export var isAndroid: boolean;
export var isIOS: boolean;
export var isIPadOS: boolean;
export var isWindows: boolean;
export var isLinux: boolean;
export var isBSD: boolean;
export var isMacOSX: boolean;

export var isInternetExplorer: boolean;
export var isEdge: boolean;;
export var isSafari: boolean;;
export var isOpera: boolean;;
export var isChrome: boolean;;
export var isFirefox: boolean;;

export var webkitVer: number;
export var isNativeChrome: boolean;;

export var BrowserName: string;
export var OSName: string;

{
    let ua = navigator.userAgent.toLowerCase();

    isAndroid = (ua.match('android') ? true : false);
    isIOS = (ua.match(/(iphone|ipod)/g) ? true : false);
    isIPadOS = ((ua.match('ipad') || (navigator.platform == 'MacIntel' && navigator.maxTouchPoints > 1)) ? true : false);
    isWindows = (ua.match('windows') ? true : false);
    isLinux = (ua.match('android') ? false : (ua.match('linux') ? true : false));
    isBSD = (ua.match('bsd') ? true : false);
    isMacOSX = !isIOS && !isIPadOS && (ua.match('mac osx') ? true : false);

    isInternetExplorer = (ua.match('msie') ? true : false);
    isEdge = (ua.match('edg') ? true : false);
    isSafari = (ua.match(/(chromium|chrome|crios)/g) ? false : (ua.match('safari') ? true : false));
    isOpera = (ua.match('opera') ? true : false);
    isChrome = !isSafari && (ua.match(/(chromium|chrome|crios)/g) ? true : false);
    isFirefox = (ua.match('like gecko') ? false : (ua.match(/(gecko|fennec|firefox)/g) ? true : false));

    webkitVer = parseInt((/WebKit\/([0-9]+)/.exec(navigator.appVersion) || ["", "0"])[1], 10) || void 0; // also match AppleWebKit
    isNativeChrome = isAndroid && webkitVer <= 537 && navigator.vendor.toLowerCase().indexOf('google') == 0;

    BrowserName = "Unknown";
    if (isInternetExplorer)
        BrowserName = "IE";
    else if (isEdge)
        BrowserName = "Edge";
    else if (isSafari)
        BrowserName = "Safari";
    else if (isOpera)
        BrowserName = "Opera";
    else if (isChrome)
        BrowserName = "Chrome";
    else if (isFirefox)
        BrowserName = "Firefox";
    else if (isNativeChrome)
        BrowserName = "NativeChrome";
    else
        BrowserName = "Unknown";

    OSName = "Unknown";
    if (isAndroid)
        OSName = "Android";
    else if (isIOS)
        OSName = "iOS";
    else if (isIPadOS)
        OSName = "iPadOS";
    else if (isWindows)
        OSName = "Windows";
    else if (isLinux)
        OSName = "Linux";
    else if (isBSD)
        OSName = "BSD";
    else if (isMacOSX)
        OSName = "MacOSX";
    else
        OSName = "Unknown";
};

export class MyWakeLock {
    private static readonly VideoWebm: string = 'GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYU4BnQI0VSalmQCgq17FAAw9CQE2AQAZ3aGFtbXlXQUAGd2hhbW15RIlACECPQAAAAAAAFlSua0AxrkAu14EBY8WBAZyBACK1nEADdW5khkAFVl9WUDglhohAA1ZQOIOBAeBABrCBCLqBCB9DtnVAIueBAKNAHIEAAIAwAQCdASoIAAgAAUAmJaQAA3AA/vz0AAA=';
    private static readonly VideoMp4: string = 'AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVlAAAAG21kYXQAAAGzABAHAAABthADAowdbb9/AAAC6W1vb3YAAABsbXZoZAAAAAB8JbCAfCWwgAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAIVdHJhawAAAFx0a2hkAAAAD3wlsIB8JbCAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAIAAAACAAAAAABsW1kaWEAAAAgbWRoZAAAAAB8JbCAfCWwgAAAA+gAAAAAVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAVxtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEcc3RibAAAALhzdHNkAAAAAAAAAAEAAACobXA0dgAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAIAAgASAAAAEgAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABj//wAAAFJlc2RzAAAAAANEAAEABDwgEQAAAAADDUAAAAAABS0AAAGwAQAAAbWJEwAAAQAAAAEgAMSNiB9FAEQBFGMAAAGyTGF2YzUyLjg3LjQGAQIAAAAYc3R0cwAAAAAAAAABAAAAAQAAAAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAAAEwAAAAEAAAAUc3RjbwAAAAAAAAABAAAALAAAAGB1ZHRhAAAAWG1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAAK2lsc3QAAAAjqXRvbwAAABtkYXRhAAAAAQAAAABMYXZmNTIuNzguMw==';

    private LockElement: any;
    private readonly Logger: Logging;

    constructor(logger: Logging) {
        this.Logger = logger;

        this.Logger.Log("Preparing WakeLock");

        if (typeof (<any>navigator).wakeLock == "undefined") {
            this.Logger.Log("Using video loop method.");
            let video = document.createElement('video');
            video.setAttribute('loop', '');
            video.setAttribute('style', 'position: fixed; opacity: 0.1; pointer-events: none;');

            MyWakeLock.AddSourceToVideo(video, 'webm', 'data:video/webm;base64,' + MyWakeLock.VideoWebm);
            MyWakeLock.AddSourceToVideo(video, 'mp4', 'data:video/mp4;base64,' + MyWakeLock.VideoMp4);

            document.body.appendChild(video);

            this.LockElement = video;
        }
        else {
            this.Logger.Log("Using WakeLock API.");
            this.LockElement = null;
        }
    }

    public Begin(): void {
        if (this.LockElement == null) {
            try {
                (<Promise<any>>(<any>navigator).wakeLock.request("screen")).then((obj: any) => {
                    this.Logger.Log("WakeLock request successful. Lock acquired.");
                    this.LockElement = obj;
                }, () => {
                    this.Logger.Log("WakeLock request failed.");
                });
            }
            catch (err) {
                this.Logger.Log("WakeLock request failed.");
            }
        }
        else {
            this.Logger.Log("WakeLock video loop started.");
            (<HTMLVideoElement>this.LockElement).play();
        }
    }

    private static AddSourceToVideo(element: HTMLVideoElement, type: string, dataURI: string): void {
        var source = document.createElement('source');
        source.src = dataURI;
        source.type = 'video/' + type;
        element.appendChild(source);
    }
}