/*
    Logging is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/
var Logging = /** @class */ (function () {
    function Logging(parentElement, childElementType) {
        this.ParentElement = parentElement;
        this.ChildElementType = childElementType;
    }
    Logging.prototype.Log = function (message) {
        var dateTime = new Date();
        var lineText = "[" + (dateTime.getHours() > 9 ? dateTime.getHours() : "0" + dateTime.getHours()) + ":" +
            (dateTime.getMinutes() > 9 ? dateTime.getMinutes() : "0" + dateTime.getMinutes()) + ":" +
            (dateTime.getSeconds() > 9 ? dateTime.getSeconds() : "0" + dateTime.getSeconds()) +
            "] " + message;
        if (this.ParentElement && this.ChildElementType) {
            var line = document.createElement(this.ChildElementType);
            line.innerText = lineText;
            this.ParentElement.appendChild(line);
        }
        else {
            console.log(lineText);
        }
    };
    return Logging;
}());
//# sourceMappingURL=3las.logging.js.map