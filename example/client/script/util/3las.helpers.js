/*
    Helpers is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/
var isAndroid;
var isIOS;
var isIPadOS;
var isWindows;
var isLinux;
var isBSD;
var isMacOSX;
var isInternetExplorer;
var isEdge;
;
var isSafari;
;
var isOpera;
;
var isChrome;
;
var isFirefox;
;
var webkitVer;
var isNativeChrome;
;
var BrowserName;
var OSName;
{
    var ua = navigator.userAgent.toLowerCase();
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
}
;
var WakeLock = /** @class */ (function () {
    function WakeLock(logger) {
        this.Logger = logger;
        this.Logger.Log("Preparing WakeLock");
        if (typeof navigator.wakeLock == "undefined") {
            this.Logger.Log("Using video loop method.");
            var video = document.createElement('video');
            video.setAttribute('loop', '');
            video.setAttribute('style', 'position: fixed; opacity: 0.1; pointer-events: none;');
            WakeLock.AddSourceToVideo(video, 'webm', 'data:video/webm;base64,' + WakeLock.VideoWebm);
            WakeLock.AddSourceToVideo(video, 'mp4', 'data:video/mp4;base64,' + WakeLock.VideoMp4);
            document.body.appendChild(video);
            this.LockElement = video;
        }
        else {
            this.Logger.Log("Using WakeLock API.");
            this.LockElement = null;
        }
    }
    WakeLock.prototype.Begin = function () {
        var _this = this;
        if (this.LockElement == null) {
            try {
                navigator.wakeLock.request("screen").then(function (obj) {
                    _this.Logger.Log("WakeLock request successful. Lock acquired.");
                    _this.LockElement = obj;
                }, function () {
                    _this.Logger.Log("WakeLock request failed.");
                });
            }
            catch (err) {
                this.Logger.Log("WakeLock request failed.");
            }
        }
        else {
            this.Logger.Log("WakeLock video loop started.");
            this.LockElement.play();
        }
    };
    WakeLock.AddSourceToVideo = function (element, type, dataURI) {
        var source = document.createElement('source');
        source.src = dataURI;
        source.type = 'video/' + type;
        element.appendChild(source);
    };
    WakeLock.VideoWebm = 'GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYU4BnQI0VSalmQCgq17FAAw9CQE2AQAZ3aGFtbXlXQUAGd2hhbW15RIlACECPQAAAAAAAFlSua0AxrkAu14EBY8WBAZyBACK1nEADdW5khkAFVl9WUDglhohAA1ZQOIOBAeBABrCBCLqBCB9DtnVAIueBAKNAHIEAAIAwAQCdASoIAAgAAUAmJaQAA3AA/vz0AAA=';
    WakeLock.VideoMp4 = 'AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVlAAAAG21kYXQAAAGzABAHAAABthADAowdbb9/AAAC6W1vb3YAAABsbXZoZAAAAAB8JbCAfCWwgAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAIVdHJhawAAAFx0a2hkAAAAD3wlsIB8JbCAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAIAAAACAAAAAABsW1kaWEAAAAgbWRoZAAAAAB8JbCAfCWwgAAAA+gAAAAAVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAVxtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEcc3RibAAAALhzdHNkAAAAAAAAAAEAAACobXA0dgAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAIAAgASAAAAEgAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABj//wAAAFJlc2RzAAAAAANEAAEABDwgEQAAAAADDUAAAAAABS0AAAGwAQAAAbWJEwAAAQAAAAEgAMSNiB9FAEQBFGMAAAGyTGF2YzUyLjg3LjQGAQIAAAAYc3R0cwAAAAAAAAABAAAAAQAAAAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAAAEwAAAAEAAAAUc3RjbwAAAAAAAAABAAAALAAAAGB1ZHRhAAAAWG1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAAK2lsc3QAAAAjqXRvbwAAABtkYXRhAAAAAQAAAABMYXZmNTIuNzguMw==';
    return WakeLock;
}());
//# sourceMappingURL=3las.helpers.js.map