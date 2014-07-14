/*
	Log-Window is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/
function LogEvent (info)
{
	var logwindow = document.getElementById("logwindow");
	var line = document.createElement("p");
	var datetime = new Date();
	var linetext = "[" + (datetime.getHours() > 9 ? datetime.getHours() : "0" + datetime.getHours()) + ":" + 
						 (datetime.getMinutes() > 9 ? datetime.getMinutes() : "0" + datetime.getMinutes()) + ":" +
						 (datetime.getSeconds() > 9 ? datetime.getSeconds() : "0" + datetime.getSeconds()) +
					"] " + info;
	line.innerHTML = linetext;
	
	logwindow.appendChild(line);
}

function ToggleLogWindow ()
{
	var logwindow = document.getElementById("logwindow");
	if (logwindow.style.display == "block")
	{
		logwindow.style.display = "none";
	}
	else
	{
		logwindow.style.display = "block";
	}
}
