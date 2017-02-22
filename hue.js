var hue = require("node-hue-api"),
		HueApi = hue.HueApi,
		lightState = hue.lightState,
		osc = require('node-osc');
		timeout = 5000;

var fs = require('fs');
var credentials = fs.readFileSync('credentials.json', 'utf8');
var jsonCredentials = JSON.parse(credentials);
var api;

var createApi = function(bridgeJSON) {
	return new HueApi(bridgeJSON.ipaddress, jsonCredentials.hueUsername);
}

var displayResult = function(result) {
		console.log(JSON.stringify(result, null, 2));
};

var animateLights = function(api, interval, period) {
	var time = Math.floor(Date.now()/interval) * interval;
	var brightness = Math.sin((time/period) * (2 * Math.PI));
	brightness = brightness * 50 + 50;
	var state = lightState.create().transition(interval).brightness(brightness);
	api.setLightState(1, state).then().done();
	console.log('Time: ' + time);
	console.log('Brightness: ' + brightness);
}

var processLights = function(bridge) {
		if (!bridge.length || !bridge[0]) {
			console.log('No bridges found. Exiting.');
		} else {
			console.log("Hue Bridges Found: " + JSON.stringify(bridge));
			console.log('Creating API');
			api = createApi(bridge[0]);
			console.log("API created. Ready to receive OSC");
			// console.log('API created. Controlling lights.');
			// setInterval(animateLights, 400, api, 400, 6000);
		}
};

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