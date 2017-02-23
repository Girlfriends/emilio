var hue = require("node-hue-api"),
		HueApi = hue.HueApi,
		lightState = hue.lightState,
		osc = require('node-osc');
		timeout = 5000;

var fs = require('fs');
var credentials = fs.readFileSync('credentials.json', 'utf8');
var jsonCredentials = JSON.parse(credentials);
var api;

var userStatus = {
	state: "DAY",
	heartRate: 180
}

var hueStatus = {
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
			state: true
		},
		{
			state: false
		}
	]
}

var createApi = function(bridgeJSON) {
	return new HueApi(bridgeJSON.ipaddress, jsonCredentials.hueUsername);
}

var displayResult = function(result) {
		console.log(JSON.stringify(result, null, 2));
};

var animateLights = function() {
	animateDay(userStatus.heartRate);
	// animateAsleep();
	// animateAwakeRestlessHelper("awake");
	// animateAwakeRestlessHelper("restless");
}

var processLights = function(bridge) {
		if (!bridge.length || !bridge[0]) {
			console.log('No bridges found. Exiting.');
		} else {
			console.log("Hue Bridges Found: " + JSON.stringify(bridge));
			console.log('Creating API');
			api = createApi(bridge[0]);
			// console.log("API created. Ready to receive OSC");
			console.log('API created. Controlling lights.');
			animateLights();
		}
};

var animateDay = function(rate) {
	var msecInterval = 60000 / (rate * hueStatus.dayAnimation.rateMultiplier);
	var transition = msecInterval * (hueStatus.dayAnimation.rising ? hueStatus.dayAnimation.midpoint : 1 - hueStatus.dayAnimation.midpoint);
	for (var i=0; i<2; i++) {
		hueStatus.lights[i].state = !hueStatus.lights[i].state;
		var brightness = hueStatus.lights[i].state ? hueStatus.dayAnimation.maxBrightness : hueStatus.dayAnimation.minBrightness;
		var state = lightState.create().brightness(brightness).transition(transition);
		api.setLightState(i+1, state).then().done();
	}
	hueStatus.dayAnimation.rising = !hueStatus.dayAnimation.rising;
	if (hueStatus.dayAnimation.rising) {
		var midShift = (Math.random() - 0.5) * 2 * hueStatus.dayAnimation.midpointDriftRate;
		var midMax = hueStatus.dayAnimation.midpointOrigin + hueStatus.dayAnimation.midpointDriftMax;
		var midMin = hueStatus.dayAnimation.midpointOrigin - hueStatus.dayAnimation.midpointDriftMax;
		hueStatus.dayAnimation.midpoint = Math.max(midMin, Math.min(midMax, hueStatus.dayAnimation.midpoint + midShift));
		if (hueStatus.dayAnimation.flipChance > Math.random()) {
			hueStatus.dayAnimation.midpoint = 1.0 - hueStatus.dayAnimation.midpoint;
			hueStatus.dayAnimation.midpointOrigin = 1.0 - hueStatus.dayAnimation.midpointOrigin;
		}
	}
	setTimeout(animateLights, transition);
}

var animateAwakeRestlessHelper = function(type) {
	switch (type) {
		case "awake":
			animateAwake();
			break;
		case "restless":
			animateRestless();
			break;
		default:
			console.log("Undefined restlessness helper");
			break;
	}
}

var animateAwake = function() {
	var msecInterval = Math.random() * 900 + 100;
	for (var i=0; i<2; i++) {
		var transition = msecInterval * Math.sqrt(Math.random());
		hueStatus.lights[i].state = !hueStatus.lights[i].state;
		var brightness = 100 * ((hueStatus.lights[i].state ? 0.5 : 0) + Math.random() * 0.5);
		var state = lightState.create().brightness(brightness).transition(transition);
		api.setLightState(i + 1, state).then().done();
	}
	setTimeout(animateLights, msecInterval);
}

var animateRestless = function() {
	var msecInterval = Math.random() * 400 + 100;
	for (var i=0; i<2; i++) {
		var transition = msecInterval * Math.random();
		hueStatus.lights[i].state = !hueStatus.lights[i].state;
		var brightness = 100 * ((hueStatus.lights[i].state ? 0.5 : 0) + Math.random() * 0.5);
		var state = lightState.create().brightness(brightness).transition(transition);
		api.setLightState(i + 1, state).then().done();
	}
	setTimeout(animateLights, msecInterval);
}

var animateAsleep = function() {
	var msecInterval = 100;
	for (var i=0; i<2; i++) {
		var brightness = Math.pow(Math.random(), hueStatus.asleepAnimation.exponent) * 100;
		var state = lightState.create().brightness(brightness).transition(0);
		api.setLightState(i+1, state).then().done();
	}
	setTimeout(animateLights, msecInterval);
}

// --------------------------
// Using a promise
hue.upnpSearch(timeout).then(processLights).done();

var oscServer = new osc.Server(3333, '0.0.0.0');
oscServer.on("message", function (msg, rinfo) {

	if (!api) return;

	var state;
	switch(msg[0]) {
		case "/brightness":
			state = lightState.create().brightness(msg[[3]]).transition(msg[2]);
			api.setLightState(msg[1], state).then().done();
			break;
		case "/light":
			break;
		default:
			console.log(`Unrecognized OSC message ${msg[0]}`);
	}
});