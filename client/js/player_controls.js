/*
	Player-Controls is part of 3LAS (Low Latency Live Audio Streaming)
	https://github.com/JoJoBond/3LAS
*/

function HTMLPlayerControls (DivID)
{
	// Used to reference the current instance of this class, within callback functions and methods
	var Self = this;

	this._PlayerControls = document.getElementById(DivID);
	if (this._PlayerControls == null)
		throw new Error('HTMLPlayerControls: Could not find player controls via specified ID.');
	this._PlayerControls.ondragstart = function(){return false;};
	
	this.OnVolumeChange = null;
	this.OnPlayClick = null;
	
	this._VolumeDragging = false;
	this._isMuted = false;
		
    this._VolumeContainer = document.querySelector("div#" + DivID + " > div.volumebar");
	if (this._VolumeContainer == null)
        throw new Error('HTMLPlayerControls: Could not find volumebar via querySelector.');	
		
    this._VolumeKnob = document.querySelector("div#" + DivID + " > div.volumebar > div.volumeknob");
	if (this._VolumeKnob == null)
        throw new Error('HTMLPlayerControls: Could not find volumeknob via querySelector.');	
    
    this._VolumeBar = document.querySelector("div#" + DivID + " > div.volumebar > div.currentvolume");
	if (this._VolumeBar == null)
        throw new Error('HTMLPlayerControls: Could not find currentvolume via querySelector.');	
    
    this._MaximumVolume = document.querySelector("div#" + DivID + " > div.volumebar > div.totalvolume");
	if (this._MaximumVolume == null)
        throw new Error('HTMLPlayerControls: Could not find totalvolume via querySelector.');	
	
	this._TotalBarSize = this._MaximumVolume.clientWidth - this._VolumeKnob.clientWidth;
	this._KnobRadius = this._VolumeKnob.clientWidth / 2.0;
	
	this._VolumeStore = this._TotalBarSize;
	
	this._VolumeKnob.style.left = this._TotalBarSize + "px";
	
    this._VolumeContainer.addEventListener("touchstart", this.__hInteractBegin.bind(this));
    this._VolumeContainer.addEventListener("mousedown", this.__hInteractBegin.bind(this));

    this._VolumeContainer.addEventListener("touchend", this.__hInteractEnd.bind(this));
    this._VolumeContainer.addEventListener("mouseup", this.__hInteractEnd.bind(this));

    this._VolumeContainer.addEventListener("touchleave", this.__hInteractLeave.bind(this));
    this._VolumeContainer.addEventListener("mouseleave", this.__hInteractLeave.bind(this));

    this._VolumeContainer.addEventListener("touchmove", this.__hInteractMove.bind(this));
    this._VolumeContainer.addEventListener("mousemove", this.__hInteractMove.bind(this));

    this._ButtonBar = document.querySelector("div#" + DivID + " > div.controlbar");
	if (this._ButtonBar == null)
        throw new Error('HTMLPlayerControls: Could not find controlbar via querySelector.');
	
    this._MuteButton = document.querySelector("div#" + DivID + " > div.controlbar > div.mutebutton");
	if (this._MuteButton == null)
        throw new Error('HTMLPlayerControls: Could not find mutebutton via querySelector.');
		
    this._UnMuteButton = document.querySelector("div#" + DivID + " > div.controlbar > div.unmutebutton");
	if (this._UnMuteButton == null)
        throw new Error('HTMLPlayerControls: Could not find unmutebutton via querySelector.');
	
    this._ButtonOverlay = document.querySelector("div#" + DivID + " > div.playbuttonoverlay");
	if (this._ButtonOverlay == null)
        throw new Error('HTMLPlayerControls: Could not find playbuttonoverlay via querySelector.');
	
    this._PlayButton = document.querySelector("div#" + DivID + " > div.playbuttonoverlay > div.playbutton");
	if (this._PlayButton == null)
        throw new Error('HTMLPlayerControls: Could not find playbutton via querySelector.');
		
    this._ActivityIndicator = document.querySelector("div#" + DivID + " > div.activityindicator");
	if (this._ActivityIndicator == null)
        throw new Error('HTMLPlayerControls: Could not find activityindicator via querySelector.');
	
    this._ActivityLightOn = document.querySelector("div#" + DivID + " > div.activityindicator > div.redlighton");
	if (this._ActivityLightOn == null)
        throw new Error('HTMLPlayerControls: Could not find redlighton via querySelector.');
	
    this._ActivityLightOff = document.querySelector("div#" + DivID + " > div.activityindicator > div.redlightoff");
	if (this._ActivityLightOff == null)
        throw new Error('HTMLPlayerControls: Could not find redlighton via querySelector.');
	
	this._ActivityStatus = false;

    this._MuteButton.addEventListener("click", this.__Mute_Click.bind(this));

    this._UnMuteButton.addEventListener("click", this.__UnMute_Click.bind(this));

    this._PlayButton.addEventListener("click", this.__Play_Click.bind(this));
}


// Pubic methods (external functions):
// ===================================

HTMLPlayerControls.prototype.ToogleActivityLight = function () {
    if (this._ActivityStatus) {
        this._ActivityLightOff.style.visibility = "visible";
        this._ActivityLightOn.style.visibility = "hidden";
        this._ActivityStatus = false;
        return false;
    }
    else {
        this._ActivityLightOff.style.visibility = "hidden";
        this._ActivityLightOn.style.visibility = "visible";
        this._ActivityStatus = true;
        return true;
    }
};

HTMLPlayerControls.prototype.SetPlaystate = function (state) {
    if (state) {
        this._VolumeContainer.style.visibility = "visible";
        this._ButtonBar.style.visibility = "visible";
        this._PlayButton.style.visibility = "hidden";
    }
    else {
        this._VolumeContainer.style.visibility = "hidden";
        this._ButtonBar.style.visibility = "hidden";
        this._PlayButton.style.visibility = "visible";
    }
};


// Private methods (Internal functions):
// =====================================

HTMLPlayerControls.prototype._UpdateVolumeBar = function (value) {
    this._VolumeKnob.style.left = value + "px";
    this._VolumeBar.style.width = value + this._KnobRadius + "px";
}

HTMLPlayerControls.prototype._UpdateVolume = function (value) {
    if (value > this._TotalBarSize)
        value = this._TotalBarSize;
    else if (value < 0)
        value = 0;

    this._UpdateVolumeBar(value);


    if (this._isMuted) {
        this._isMuted = false;
        this._MuteButton.style.visibility = "visible";
        this._UnMuteButton.style.visibility = "hidden";
    }

    if (typeof this.OnVolumeChange === 'function')
        this.OnVolumeChange(value / this._TotalBarSize);
};


// Internal callback functions
// ===========================

HTMLPlayerControls.prototype.__hInteractBegin = function (e) {
    this._VolumeDragging = true;
    if (window.e)
        e = window.e;
    var mousex = e.pageX - getOffsetSum(Self.VolumeContainer).left;

    this._UpdateVolume(mousex - this._KnobRadius);
};

HTMLPlayerControls.prototype.__hInteractEnd = function (e) {
    this._VolumeDragging = false;
};

HTMLPlayerControls.prototype.__hInteractLeave = function (e) {
    this._VolumeDragging = false;
};

HTMLPlayerControls.prototype.__hInteractMove = function (e) {
    if (this._VolumeDragging) {
        if (window.e)
            e = window.e;
        var mousex = e.pageX - getOffsetSum(this._VolumeContainer).left;

        this._UpdateVolume(mousex - this._KnobRadius);
    }
};

HTMLPlayerControls.prototype.__Mute_Click = function (e) {
    this._isMuted = true;
    this._UnMuteButton.style.visibility = "visible";
    this._MuteButton.style.visibility = "hidden";

    this._VolumeStore = parseInt(this._VolumeKnob.style.left);
    this._UpdateVolumeBar(0);
    if (typeof this.OnVolumeChange === 'function')
        this.OnVolumeChange(0.0);
};

HTMLPlayerControls.prototype.__UnMute_Click = function (e) {
    this._isMuted = false;
    this._MuteButton.style.visibility = "visible";
    this._UnMuteButton.style.visibility = "hidden";

    this._UpdateVolumeBar(this._VolumeStore);
    if (typeof this.OnVolumeChange === 'function')
        this.OnVolumeChange(this._VolumeStore / this._TotalBarSize);
};

HTMLPlayerControls.prototype.__Play_Click = function (e) {
    if (typeof this.OnPlayClick === 'function')
        this.OnPlayClick();
};


function getOffsetSum(elem) {
    var top = 0, left = 0;
    while (elem) {
        top = top + parseInt(elem.offsetTop);
        left = left + parseInt(elem.offsetLeft);
        elem = elem.offsetParent;
    }
    return { top: top, left: left };
}
