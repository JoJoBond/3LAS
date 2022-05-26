/*
    Helpers is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/

var isAndroid: boolean;
var isIOS: boolean;
var isIPadOS: boolean;
var isWindows: boolean;
var isLinux: boolean;
var isBSD: boolean;
var isMacOSX: boolean;

var isInternetExplorer: boolean;
var isEdge: boolean;;
var isSafari: boolean;;
var isOpera: boolean;;
var isChrome: boolean;;
var isFirefox: boolean;;

var webkitVer: number;
var isNativeChrome: boolean;;

var BrowserName: string;
var OSName: string;

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