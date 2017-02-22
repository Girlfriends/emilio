// initialize the express application
var express = require("express"),
    https = require('https'),
    app = express(),
    request = require('request');
    clientId = "2284MH",
    clientSecret = "cad34dee857fd77a7408ce4d8e5e94af",
    callbackUrl = "http://localhost:3000/callback";


app.set('view engine', 'pug');

var code;
var heartRate;
var userId;
var accessToken;

// initialize the Fitbit API client
var FitbitApiClient = require("fitbit-node"),
    client = new FitbitApiClient(clientId, clientSecret);

var fetchProfile = function(accessToken, response) {
    client.get('/profile.json', accessToken).then(function(results){
        userId = results[0].encodedId;
        if (response) {
            response.send(results[0]);
        }
    })
}

var fetchHeartRate = function(accessToken, response) {
    console.log('Pulling heart rate');
    if (!accessToken) {
        console.log('Not yet authenticated.');
        return;
    } else {
        client.get(
            // '/activities/heart/date/2017-02-11/2017-02-13/1sec.json',
            '/activities/heart/date/2017-02-13/1d.json',
            accessToken
        ).then(function(results) {
            heartRate = results[0];
            if (response){
                response.send(heartRate);
            }
        });
    }
}

// var refreshAccessToken = function() {
//     console.log("Refreshing access token");
//     if (!accessToken) {
//         console.log("No access token to refresh!");
//     }
// }

// redirect the user to the Fitbit authorization page
app.get("/authorize", function (req, res) {
    // request access to the user's activity, heartrate, location, nutrion, profile, settings, sleep, social, and weight scopes
    console.log('Authorizing...');
    res.redirect(client.getAuthorizeUrl('activity heartrate location nutrition profile settings sleep social weight', callbackUrl));
});

app.get('/heartrate', function(req, res) {
    fetchHeartRate(accessToken, res);
});

// handle the callback from the Fitbit authorization flow
app.get("/callback", function (req, res) {
    // exchange the authorization code we just received for an access token
    console.log('Authorization callback requested');
    client.getAccessToken(req.query.code, callbackUrl).then(function (result) {
        // use the access token to fetch the user's profile information
        console.log('Access token requested');
        accessToken = result.access_token;
        fetchProfile(accessToken, res);
    }).catch(function (error) {
        res.send(error);
    });
});

app.get('/', function(req, res) {
    var getFitApiStatus = function(){
        if (!heartRate) {
            return 'Still authenticating'
        } else {
            return 'API authenticated'
        }
    }
    res.render('index',
        {
            title: 'Hey',
            message: 'Hello there!',
            fitApiStatus: getFitApiStatus()
        });
});

// launch the server
app.listen(3000, function(){
    console.log('example app listening on port 3000!');
    // fetchHeartRate();
    setInterval(fetchHeartRate, 15000 * 60);
    // setInterval(refreshAccessToken, 2500);
});