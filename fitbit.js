// initialize the express application
var express = require("express"),
    https = require('https'),
    app = express(),
    request = require('request'),
    _ = require("lodash"),
    Hue = require("./hue.js"),
    clientId = "2284MH",
    clientSecret = "cad34dee857fd77a7408ce4d8e5e94af",
    callbackUrl = "http://localhost:3000/callback";

app.set('view engine', 'pug');

var code;
var heartRate;
var heartRateData = [];
var sleepData = [];
var userId;
var accessToken;
var refreshToken;
var isFetching = false;
var updateActive = false;
var hue;

// initialize the Fitbit API client
var FitbitApiClient = require("fitbit-node"),
    client = new FitbitApiClient(clientId, clientSecret);

var minutesAgo = function(ago) {
    var d = new Date();
    d.setMinutes(d.getMinutes() - ago);
    return d;
}

var fetchProfile = function(accessToken, response) {
    client.get('/profile.json', accessToken).then(function(results){
        userId = results[0].encodedId;
        if (response) {
            response.send(results[0]);
        }
    });
}

var appendNewHeartRateData = function(data) {
    var datapoints = data["activities-heart-intraday"]["dataset"];
    heartRateData = heartRateData.concat(datapoints);
    heartRateData = _.uniqBy(heartRateData, "time");
}

var appendNewSleepData = function(data) {
    debugger;
    var datapoints = data["activities-heart-intraday"]["dataset"];
    heartRateData = heartRateData.concat(datapoints);
    heartRateData = _.uniqBy(heartRateData, "time");
}

var updateHeartRate = function() {
    updateActive = true;
    if (heartRateData.length < 10) {
        var lastDataPointTime = new Date();
        // if we have heart rate data already
        if (heartRateData.length !== 0) {
            // get data from the last point we have
            var lastDataTimeComponents = heartRateData[heartRateData.length - 1].time.split(':');
            lastDataPointTime.setHours(lastDataTimeComponents[0]);
            lastDataPointTime.setMinutes(lastDataTimeComponents[1]);
            lastDataPointTime.setSeconds(lastDataTimeComponents[2]);
        } else {
            // get data from fifteen minutes ago
            lastDataPointTime.setMinutes(lastDataPointTime.getMinutes() - 15);
        }
        fetchHeartRate(lastDataPointTime).then(function(wrappedData) {
            var data = wrappedData[0];
            appendNewHeartRateData(data);
            if (!updateActive) {
                updateHeartRate();
            }
        }, function(err) {
            console.log(err);
        });
    }
    if (heartRateData.length < 2) {
        updateActive = false;
        return;
    }
    heartRate = heartRateData[0].value;
    hue.heartRate = heartRate;
    console.log('updateHeartRate heart rate: ' + heartRate);
    var currTimeComponents = heartRateData[0].time.split(':');
    var nextTimeComponents = heartRateData[1].time.split(':');
    if (nextTimeComponents[0] < currTimeComponents[0]) {
        nextTimeComponents[0] += 24;
    }
    // compute number of seconds in each one
    var currTimeSeconds = currTimeComponents[0] * 3600 + currTimeComponents[1] * 60 + currTimeComponents[2];
    var nextTimeSeconds = nextTimeComponents[0] * 3600 + nextTimeComponents[1] * 60 + nextTimeComponents[2];
    var waitTime = nextTimeSeconds - currTimeSeconds;
    heartRateData.splice(0,1);
    setTimeout(updateHeartRate, waitTime * 1000);
}

var fetchHeartRate = function(startTimeDate) {
    console.log('Pulling heart rate');
    if (isFetching) {
        return new Promise(function(resolve, reject) {
            reject('Already pulling heart rate.')
        });
    }
    var now = new Date();
    var startTime = `${startTimeDate.getHours()}:${startTimeDate.getMinutes()}`;
    var endTime = `${now.getHours()}:${now.getMinutes()}`;
    if (!accessToken) {
        return new Promise(function(resolve, reject) {
            reject('Not yet authenticated.');
        });
    } else {
        console.log('Sending heart rate request');
        isFetching = true;
        return client.get(
            `/activities/heart/date/today/1d/1sec/time/${startTime}/${endTime}.json`,
            accessToken
        ).then(function(results) {
            isFetching = false;
            return results;
        });
    }
}

var refreshAccessToken = function() {
    console.log("Refreshing access token");
    if (!accessToken) {
        console.log("No access token to refresh!");
    } else {
        client.refreshAccessToken(accessToken, refreshToken).then(function (result) {
            console.log("Access token refreshed");
            console.log(result);
        }, function(result) {
            console.log("Failed to refresh access token");
            console.log(result);
        })
    }
}

var restartHue = function() {
    console.log("Starting hue");
    hue.searchForHueBridge().then(function(result) {
        hue.isAnimating = true;
    }, function(err) {
        console.log(err);
    });
}

// redirect the user to the Fitbit authorization page
app.get("/authorize", function (req, res) {
    // request access to the user's activity, heartrate, location, nutrion, profile, settings, sleep, social, and weight scopes
    console.log('Authorizing...');
    res.redirect(client.getAuthorizeUrl('activity heartrate sleep', callbackUrl));
});

// handle the callback from the Fitbit authorization flow
app.get("/callback", function (req, res) {
    // exchange the authorization code we just received for an access token
    console.log('Authorization callback requested');
    client.getAccessToken(req.query.code, callbackUrl).then(function (result) {
        // use the access token to fetch the user's profile information
        console.log('Access token requested');
        accessToken = result.access_token;
        refreshToken = result.refresh_token;
        fetchHeartRate(minutesAgo(15)).then(function(wrappedData) {
            var data = wrappedData[0];
            appendNewHeartRateData(data);
            updateHeartRate();
            res.send(data);
        }, function(err) {
            res.send(err);
        });
    }).catch(function (error) {
        res.send(error);
    });
});

app.get('/', function(req, res) {
    var getFitApiStatus = function(){
        if (!accessToken) {
            return 'Still authenticating'
        } else {
            return 'API authenticated'
        }
    }
    res.render('index',
        {
            title: 'Hey',
            message: 'Hello there!',
            fitApiStatus: getFitApiStatus(),
            lastHeartRate: heartRate,
            lastFetchHeartRateTime: lastFetchHeartRateTime
        });
});

// launch the server
app.listen(3000, function(){
    console.log('example app listening on port 3000!');
    // setInterval(refreshAccessToken, 5000);
    hue = new Hue();
    hue.on("crash", restartHue);
    restartHue();
});