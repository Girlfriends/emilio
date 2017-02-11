// initialize the express application
var express = require("express"),
    app = express();

var YOUR_CLIENT_ID = "2284MH";
var YOUR_CLIENT_SECRET = "cad34dee857fd77a7408ce4d8e5e94af";
var YOUR_CALLBACK_URL = "http://localhost:3000/callback";

// initialize the Fitbit API client
var FitbitApiClient = require("fitbit-node"),
    client = new FitbitApiClient("2284MH", "cad34dee857fd77a7408ce4d8e5e94af");

// redirect the user to the Fitbit authorization page
app.get("/authorize", function (req, res) {
    // request access to the user's activity, heartrate, location, nutrion, profile, settings, sleep, social, and weight scopes
    res.redirect(client.getAuthorizeUrl('activity heartrate location nutrition profile settings sleep social weight', YOUR_CALLBACK_URL));
});

// handle the callback from the Fitbit authorization flow
app.get("/callback", function (req, res) {
    // exchange the authorization code we just received for an access token
    client.getAccessToken(req.query.code, YOUR_CALLBACK_URL).then(function (result) {
        // use the access token to fetch the user's profile information
        client.get("/profile.json", result.access_token).then(function (results) {
            res.send(results[0]);
        });
    }).catch(function (error) {
        res.send(error);
    });
});

// launch the server
app.listen(3000, function(){
    console.log('example app listening on port 3000!')
});