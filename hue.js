var hue = require("node-hue-api"),
    HueApi = hue.HueApi,
    lightState = hue.lightState,
    timeout = 5000;

var fs = require('fs');
var credentials = fs.readFileSync('credentials.json', 'utf8');
var jsonCredentials = JSON.parse(credentials);

var createApi = function(bridgeJSON){
	return new HueApi(bridgeJSON.ipaddress, jsonCredentials.hueUsername);
}

var displayResult = function(result) {
    console.log(JSON.stringify(result, null, 2));
};

var processLights = function(bridge){
    if (!bridge.length || !bridge[0]) {
    	console.log('No bridges found. Exiting.');
    } else {
	    console.log("Hue Bridges Found: " + JSON.stringify(bridge));
	    console.log('Creating API');
	    var api = createApi(bridge[0]);
	    console.log('API created. Controlling lights.');
	    var state = lightState.create().on().brightness(100);
	    api.setLightState(1, state).then(displayResult).done();
    }
};

// --------------------------
// Using a promise
hue.upnpSearch(timeout).then(processLights).done();