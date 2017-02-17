var hue = require('node-hue-api'),
    timeout = 2000; // 2 seconds

var fs = require('fs');
var credentials = fs.readfileSync('credentials.json', 'utf8');
var jsonCredentials = JSON.parse(credentials);

var displayBridges = function(bridge) {
    console.log("Hue Bridges Found: " + JSON.stringify(bridge));
};

// --------------------------
// Using a promise
hue.upnpSearch(timeout).then(displayBridges).done();