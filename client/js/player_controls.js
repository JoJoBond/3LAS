/*
	Player-Controls is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/
function HTMLPlayerControls(DivID)
{
	// Used to reference the current instance of this class, within callback functions and methods
	var Self = this;

	this.PlayerControls = document.getElementById(DivID);
	if (this.PlayerControls == null)
		throw new Error('HTMLPlayerControls: Could not find player controls via specified ID.');
	this.PlayerControls.ondragstart = function(){return false;};
	
	this.OnVolumeChange = null;
	this.OnPlayClick = null;
	
	this.VolumeDragging = false;
	this.isMuted = false;
		
	this.VolumeContainer = getChildByClass(this.PlayerControls, "volumebar");
	if (this.VolumeContainer == null)
		throw new Error('HTMLPlayerControls: Could not find volumebar via class search.');	
		
	this.VolumeKnob = getChildByClass(this.VolumeContainer, "volumeknob");
	if (this.VolumeKnob == null)
		throw new Error('HTMLPlayerControls: Could not find volumeknob via class search.');	
	
	this.VolumeBar = getChildByClass(this.VolumeContainer, "currentvolume");
	if (this.VolumeBar == null)
		throw new Error('HTMLPlayerControls: Could not find currentvolume via class search.');	
	
	this.MaximumVolume = getChildByClass(this.VolumeContainer, "totalvolume");
	if (this.MaximumVolume == null)
		throw new Error('HTMLPlayerControls: Could not find totalvolume via class search.');	
	
	this.TotalBarSize = this.MaximumVolume.clientWidth - this.VolumeKnob.clientWidth;
	this.KnobRadius = this.VolumeKnob.clientWidth / 2.0;
	
	this.VolumeStore = this.TotalBarSize;
	
	this.VolumeKnob.style.left = this.TotalBarSize + "px";
	
	function hInteractBegin(e)
	{
		Self.VolumeDragging = true;
		if(window.e)
			e = window.e;
		var mousex = e.pageX - getOffsetSum(Self.VolumeContainer).left;
		
		UpdateVolume(mousex - Self.KnobRadius);
	}
	this.VolumeContainer.ontouchstart = hInteractBegin;
	this.VolumeContainer.onmousedown = hInteractBegin;
	
	function hInteractEnd(e)
	{
		Self.VolumeDragging = false;
	}
	this.VolumeContainer.onmouseup = hInteractEnd;
	this.VolumeContainer.ontouchend = hInteractEnd;
	
	function hInteractLeave(e)
	{
		Self.VolumeDragging = false;
	}
	this.VolumeContainer.onmouseleave = hInteractLeave;
	this.VolumeContainer.ontouchleave = hInteractLeave;
	
	function hInteractMove(e)
	{
		if (Self.VolumeDragging)
		{
		    if(window.e)
				e = window.e;
			var mousex = e.pageX - getOffsetSum(Self.VolumeContainer).left;
			
			UpdateVolume(mousex - Self.KnobRadius);
		}
	}
	this.VolumeContainer.onmousemove = hInteractMove;
	this.VolumeContainer.ontouchmove = hInteractMove;

	this.ButtonBar = getChildByClass(this.PlayerControls, "controlbar");
	if (this.ButtonBar == null)
		throw new Error('HTMLPlayerControls: Could not find controlbar via class search.');
	
	this.MuteButton = getChildByClass(this.ButtonBar, "mutebutton");
	if (this.MuteButton == null)
		throw new Error('HTMLPlayerControls: Could not find mutebutton via class search.');
		
	this.UnMuteButton = getChildByClass(this.ButtonBar, "unmutebutton");
	if (this.UnMuteButton == null)
		throw new Error('HTMLPlayerControls: Could not find unmutebutton via class search.');
	
	this.ButtonOverlay = getChildByClass(this.PlayerControls, "playbuttonoverlay");
	if (this.ButtonOverlay == null)
		throw new Error('HTMLPlayerControls: Could not find playbuttonoverlay via class search.');
	
	this.PlayButton = getChildByClass(this.ButtonOverlay, "playbutton");
	if (this.PlayButton == null)
		throw new Error('HTMLPlayerControls: Could not find playbutton via class search.');
		
	this.ActivityIndicator = getChildByClass(this.PlayerControls, "activityindicator");
	if (this.ActivityIndicator == null)
		throw new Error('HTMLPlayerControls: Could not find activityindicator via class search.');
	
	this.ActivityLightOn = getChildByClass(this.ActivityIndicator, "redlighton");
	if (this.ActivityLightOn == null)
		throw new Error('HTMLPlayerControls: Could not find redlighton via class search.');
	
	this.ActivityLightOff = getChildByClass(this.ActivityIndicator, "redlightoff");
	if (this.ActivityLightOff == null)
		throw new Error('HTMLPlayerControls: Could not find redlighton via class search.');
	
	this.ActivityStatus = false;
	
	this.ToogleActivityLight = ToogleActivityLight;
	function ToogleActivityLight ()
	{
		if (Self.ActivityStatus)
		{
			Self.ActivityLightOff.style.visibility = "visible";
			Self.ActivityLightOn.style.visibility = "hidden";
			Self.ActivityStatus = false;
			return false;
		}
		else
		{
			Self.ActivityLightOff.style.visibility = "hidden";
			Self.ActivityLightOn.style.visibility = "visible";
			Self.ActivityStatus = true;
			return true;
		}
	}
	
	this.SetPlaystate = SetPlaystate;
	function SetPlaystate (state)
	{
		if (state)
		{
			Self.VolumeContainer.style.visibility = "visible";
			Self.ButtonBar.style.visibility = "visible";
			Self.PlayButton.style.visibility = "hidden";
		}
		else
		{
			Self.VolumeContainer.style.visibility = "hidden";
			Self.ButtonBar.style.visibility = "hidden";
			Self.PlayButton.style.visibility = "visible";
		}
	}
	
	function Mute_Click(e)
	{
		Self.isMuted = true;
		Self.UnMuteButton.style.visibility = "visible";
		Self.MuteButton.style.visibility = "hidden";
		
		Self.VolumeStore = parseInt(Self.VolumeKnob.style.left);
		UpdateVolumeBar(0);
		if (typeof Self.OnVolumeChange === 'function')
			Self.OnVolumeChange(0.0);
	}
	this.MuteButton.onclick = Mute_Click;
	
	function UnMute_Click(e)
	{
		Self.isMuted = false;
		Self.MuteButton.style.visibility = "visible";
		Self.UnMuteButton.style.visibility = "hidden";
		
		UpdateVolumeBar(Self.VolumeStore);
		if (typeof Self.OnVolumeChange === 'function')
			Self.OnVolumeChange(Self.VolumeStore / Self.TotalBarSize);
	}
	this.UnMuteButton.onclick = UnMute_Click;

	function Play_Click(e)
	{
		if (typeof Self.OnPlayClick === 'function')
			Self.OnPlayClick();
	}
	this.PlayButton.onclick = Play_Click;
	
	function UpdateVolumeBar (value)
	{	
		Self.VolumeKnob.style.left = value + "px";
		Self.VolumeBar.style.width = value + Self.KnobRadius + "px";
	}

	function UpdateVolume (value)
	{
		if (value > Self.TotalBarSize)
			value = Self.TotalBarSize;
		else if (value < 0)
			value = 0;
		
		UpdateVolumeBar(value);
		
		
		if (Self.isMuted)
		{
			Self.isMuted = false;
			Self.MuteButton.style.visibility = "visible";
			Self.UnMuteButton.style.visibility = "hidden";
		}
				
		if (typeof Self.OnVolumeChange === 'function')
			Self.OnVolumeChange(value / Self.TotalBarSize);
	}
}

// Get child element from parent by class name
function getChildByClass(el, className)
{
    for (var i = 0, il = el.childNodes.length; i < il; i++)
	{
        var classes = el.childNodes[i].className != undefined ? el.childNodes[i].className.split(" ") : [];
        for (var j = 0, jl = classes.length; j < jl; j++)
		{
            if (classes[j] == className)
				notes = el.childNodes[i];
        }
    }
    return notes;
}
	
function getOffsetSum(elem)
{
	var top=0, left=0;
	while(elem)
	{
		top = top + parseInt(elem.offsetTop);
		left = left + parseInt(elem.offsetLeft);
		elem = elem.offsetParent;
	}
	return {top: top, left: left};
}
