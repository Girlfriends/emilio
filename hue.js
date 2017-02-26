"use strict";

var hue = require("node-hue-api"),
		HueApi = hue.HueApi,
		lightState = hue.lightState,
		osc = require('node-osc');

var fs = require('fs');
var credentials = fs.readFileSync('credentials.json', 'utf8');
var jsonCredentials = JSON.parse(credentials);
var EventEmitter = require('events');

module.exports = class Hue extends EventEmitter {
	get USER_STATES() {
		return {
			DAY: "DAY",
			AWAKE: "AWAKE",
			RESTLESS: "RESTLESS",
			ASLEEP: "ASLEEP"
		}
	}

	constructor() {
		super();
		this._api;
		this._userStatus = {
			state: "DAY",
			heartRate: 180
		};
		this._hueStatus = {
			dayAnimation: {
				rising : true,
				midpoint: 0.2,
				midpointOrigin: 0.15,
				midpointDriftRate: 0.025,
				midpointDriftMax: 0.05,
				rateMultiplier: 0.2,
				maxBrightness: 25,
				minBrightness: 0,
				flipChance: 0.4
			},
			asleepAnimation: {
				exponent: 2.0
			},
			lights: [
				{
					state: true,
					brightness: 0
				},
				{
					state: false,
					brightness: 0
				}
			]
		};

		this._heartRate = 60;
		this._userState = this.USER_STATES.DAY;
		this._isAnimating = false;
	}

	get heartRate() {
		return this._heartRate;
	}

	set heartRate(hr) {
		console.log("Setting heart rate to " + hr);
		this._heartRate = hr;
	}

	get userState() {
		return this._userState;
	}

	set userState(us) {
		this._userState = us;
	}

	get isAnimating() {
		return this._isAnimating;
	}

	set isAnimating(an) {
		if (this._isAnimating !== an) {
			this._isAnimating = an;
			if (this._isAnimating) this.animateLights();
		}
	}

	_createApi(bridgeJSON) {
		return new HueApi(bridgeJSON.ipaddress, jsonCredentials.hueUsername);
	}

	_displayResult(result) {
		console.log(JSON.stringify(result, null, 2));
	}

	_processSearchResult(bridge) {
		return new Promise((function(resolve, reject) {
			if (!bridge.length || !bridge[0]) {
				console.log('No bridges found.');
				reject('No bridges found.');
			} else {
				console.log("Hue Bridges Found: " + JSON.stringify(bridge));
				console.log('Creating API');
				this._api = this._createApi(bridge[0]);
				console.log('API created.');
				resolve(this._api);
			}
		}).bind(this));
	}

	getLightBrightness(i) {
		return this._hueStatus.lights[i].brightness;
	}

	searchForHueBridge() {
		return hue.upnpSearch(5000).then(this._processSearchResult.bind(this));
	}

	animateDay(rate) {

		var msecInterval = 60000 / (rate * this._hueStatus.dayAnimation.rateMultiplier);
		msecInterval = Math.max(100, msecInterval);
		var transition = msecInterval * (this._hueStatus.dayAnimation.rising ? this._hueStatus.dayAnimation.midpoint : 1 - this._hueStatus.dayAnimation.midpoint);
		for (var i=0; i<2; i++) {
			this._hueStatus.lights[i].state = !this._hueStatus.lights[i].state;
			var brightness = this._hueStatus.lights[i].state ? this._hueStatus.dayAnimation.maxBrightness : this._hueStatus.dayAnimation.minBrightness;
			var state = lightState.create().brightness(brightness).transition(transition);
			this._hueStatus.lights[i].brightness = brightness;
			this._api.setLightState(i+1, state).then().done();
		}
		this._hueStatus.dayAnimation.rising = !this._hueStatus.dayAnimation.rising;
		if (this._hueStatus.dayAnimation.rising) {
			var midShift = (Math.random() - 0.5) * 2 * this._hueStatus.dayAnimation.midpointDriftRate;
			var midMax = this._hueStatus.dayAnimation.midpointOrigin + this._hueStatus.dayAnimation.midpointDriftMax;
			var midMin = this._hueStatus.dayAnimation.midpointOrigin - this._hueStatus.dayAnimation.midpointDriftMax;
			this._hueStatus.dayAnimation.midpoint = Math.max(midMin, Math.min(midMax, this._hueStatus.dayAnimation.midpoint + midShift));
			if (this._hueStatus.dayAnimation.flipChance > Math.random()) {
				this._hueStatus.dayAnimation.midpoint = 1.0 - this._hueStatus.dayAnimation.midpoint;
				this._hueStatus.dayAnimation.midpointOrigin = 1.0 - this._hueStatus.dayAnimation.midpointOrigin;
			}
		}
		setTimeout(this.animateLights.bind(this), Math.max(100, transition));
	}

	_animateAwakeRestless(maxTime, exponent) {
		var msecInterval = Math.random() * maxTime + 200;
		for (var i=0; i<2; i++) {
			var transition = msecInterval * Math.pow(Math.random(), exponent);
			this._hueStatus.lights[i].state = !this._hueStatus.lights[i].state;
			var brightness = 100 * ((this._hueStatus.lights[i].state ? 0.5 : 0) + Math.random() * 0.5);
			var state = lightState.create().brightness(brightness).transition(transition);
			this._hueStatus.lights[i].brightness = brightness;
			this._api.setLightState(i + 1, state).then().done();
		}
		setTimeout(this.animateLights.bind(this), msecInterval);
	}

	animateAwake() {
		this._animateAwakeRestless(900, 0.5);
	}

	animateRestless() {
		this._animateAwakeRestless(400, 1.0);
	}

	animateAsleep() {
		var msecInterval = 200;
		for (var i=0; i<2; i++) {
			var brightness = Math.pow(Math.random(), this._hueStatus.asleepAnimation.exponent) * 100;
			var state = lightState.create().brightness(brightness).transition(0);
			this._hueStatus.lights[i].brightness = brightness;
			this._api.setLightState(i+1, state).then().done();
		}
		setTimeout(this.animateLights.bind(this), msecInterval);
	}

	animateLights() {
		if (!this._isAnimating) return;

		try {
			switch (this.userState) {
				case this.USER_STATES.DAY:
					this.animateDay(this.heartRate);
					break;
				case this.USER_STATES.AWAKE:
					this.animateAwake();
					break;
				case this.USER_STATES.RESTLESS:
					this.animateRestless();
					break;
				case this.USER_STATES.ASLEEP:
					this.animateAsleep();
					break;
			}
		} catch (e) {
			console.log("Hue crashed");
			console.log(e);
			this.emit("crash");
		}
	}
}
