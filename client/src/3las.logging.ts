/*
	Logging is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

class Logging {
    private readonly ParentElement: HTMLElement;
    private readonly ChildElementType: string;

    constructor(parentElement: HTMLElement, childElementType: string) {
        this.ParentElement = parentElement;
        this.ChildElementType = childElementType;
    }

    public Log(message: string): void
    {
        let dateTime: Date = new Date();
        let lineText: string = "[" + (dateTime.getHours() > 9 ? dateTime.getHours() : "0" + dateTime.getHours()) + ":" + 
                             (dateTime.getMinutes() > 9 ? dateTime.getMinutes() : "0" + dateTime.getMinutes()) + ":" +
                             (dateTime.getSeconds() > 9 ? dateTime.getSeconds() : "0" + dateTime.getSeconds()) +
                        "] " + message;
        
        if(this.ParentElement && this.ChildElementType) {
            let line: HTMLElement = document.createElement(this.ChildElementType);
            line.innerText = lineText;
            this.ParentElement.appendChild(line);
        }
        else {
            console.log(lineText);
        }
    }
}