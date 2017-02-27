// initialize the express application
var express = require("express"),
    https = require('https'),
    app = express(),
    request = require('request'),
    _ = require("lodash"),
    dateFormat = require("dateformat"),
    Hue = require("./hue.js"),
    clientId = "2284MH",
    clientSecret = "cad34dee857fd77a7408ce4d8e5e94af",
    callbackUrl = "http://localhost:3000/callback";

app.set('view engine', 'pug');

var code;
var heartRate;
var heartRateData = [];
var sleepDataByDate = {};
var lastHeartRateRequestTime;
var lastSleepDataRequestTime;
var userId;
var accessToken;
var refreshToken;
var expiresAt;
var isFetchingHeartRate = false;
var heartRateUpdateActive = false;
var hue;

// initialize the Fitbit API client
var FitbitApiClient = require("fitbit-node"),
    client = new FitbitApiClient(clientId, clientSecret);

////////////////// HELPERS //////////////////////////

// Use this to set the present to some time in the past, for testing
var now = function() {
    var tn = new Date();
    // tn.setMinutes(14);
    // tn.setDate(tn.getDate() - 3);
    return tn;
}

var minutesAgo = function(ago) {
    var d = now();
    d.setMinutes(d.getMinutes() - ago);
    return d;
}

var daysAgo = function(ago) {
    var d = now();
    d.setDate(d.getDate() - ago);
    return d;
}

var setAccessToken = function(_accessToken, _refreshToken) {
    accessToken = _accessToken;
    refreshToken = _refreshToken;
    refreshSleepData();
    if (!heartRateUpdateActive) updateHeartRate();
}

var fetchProfile = function(accessToken, response) {
    client.get('/profile.json', accessToken).then(function(results){
        userId = results[0].encodedId;
        if (response) {
            response.send(results[0]);
        }
    });
}

var compareFitbitDateStrings = function(d1, d2) {
    var d1Comp = d1.split("-");
    var d2Comp = d2.split("-");
    var d1a = d1[0] * 1000 + d1[1] * 100 + d1[2] * 1;
    var d2a = d2[0] * 1000 + d2[1] * 100 + d2[2] * 1;
    return d1a - d2a;
}

var compareFitbitTimeStrings = function(t1, t2) {
    var t1Comp = t1.split(":");
    var t2Comp = t2.split(":");
    if (t1Comp[0] - t2Comp[0] > 12) t2Comp[0] += 24;
    var t1a = t1[0] * 3600 + t1[1] * 60 + t1[2] * 1;
    var t2a = t2[0] * 3600 + t2[1] * 60 + t2[2] * 1;
    return t1a - t2a;
}

var displayStringForUserState = function(state) {
    switch (state) {
        case hue.USER_STATES.DAY:
            return "Awake";
        case hue.USER_STATES.AWAKE:
            return "In bed, awake";
        case hue.USER_STATES.RESTLESS:
            return "In bed, restless";
        case hue.USER_STATES.ASLEEP:
            return "In bed, asleep";
    }

    return "Unknown!";
}

////////////////// HEART RATE DATA //////////////////////////

var appendNewHeartRateData = function(datapoints) {
    if (heartRateData.length === 0) {
        heartRateData = heartRateData.concat(datapoints);
    } else {
        var lastTime = heartRateData[heartRateData.length - 1].time;
        for (var i=0; i<datapoints.length; i++) {
            var pointTime = datapoints[i].time;
            if (compareFitbitDateStrings(pointTime, lastTime) > 0) heartRateData.push(datapoints[i]);
        }
    }
}

var makeHeartDataRequestIfNeeded = function() {
    if (heartRateData.length < 10) {
        var lastDataPointTime = now();
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
        fetchHeartRate(lastDataPointTime, function(wrappedData) {
            var data = wrappedData[0];
            if (data.hasOwnProperty("activities-heart-intraday") &&
                data["activities-heart-intraday"].hasOwnProperty("dataset")) {
                data = data["activities-heart-intraday"]["dataset"];
                if (data.length > 0) {
                    appendNewHeartRateData(data);
                    if (!heartRateUpdateActive) {
                        updateHeartRate();
                    }
                } else {
                    console.log("Requested heart rate data, but didn't get any");
                }
            } else {
                console.log("Requested heart rate data, but it was badly formatted");
                console.log(data);
            }
        });
    }
}

var updateHeartRate = function() {
    heartRateUpdateActive = true;
    var rt = new Date();
    var waitTimeForRequest = 0;
    if (lastHeartRateRequestTime !== undefined && rt.getTime() - lastHeartRateRequestTime.getTime() < 10000)
        waitTimeForRequest = 20000;
    lastHeartRateRequestTime = rt;
    setTimeout(makeHeartDataRequestIfNeeded, waitTimeForRequest);
    if (heartRateData.length < 2) {
        heartRateUpdateActive = false;
        return;
    }
    heartRate = heartRateData[0].value;
    hue.heartRate = heartRate;
    var currTimeComponents = heartRateData[0].time.split(':');
    var nextTimeComponents = heartRateData[1].time.split(':');
    for (var i=0; i<currTimeComponents.length; i++) {
        currTimeComponents[i] = parseInt(currTimeComponents[i]);
        nextTimeComponents[i] = parseInt(nextTimeComponents[i]);
    }
    if (nextTimeComponents[0] < currTimeComponents[0]) {
        nextTimeComponents[0] += 24;
    }
    // compute number of seconds in each one
    var currTimeSeconds = currTimeComponents[0] * 3600 + currTimeComponents[1] * 60 + currTimeComponents[2];
    var nextTimeSeconds = nextTimeComponents[0] * 3600 + nextTimeComponents[1] * 60 + nextTimeComponents[2];
    var waitTime = nextTimeSeconds - currTimeSeconds;
    console.log('updateHeartRate time: ' + heartRateData[0].time);
    console.log('updateHeartRate heart rate: ' + heartRate);
    console.log('updateHeartRate next update in: ' + waitTime);
    heartRateData.splice(0,1);
    setTimeout(updateHeartRate, waitTime * 1000);
}

var fetchHeartRate = function(startTimeDate, successCallback, errorCallback) {
    console.log('fetchHeartRate: ' + startTimeDate);
    if (!accessToken) {
        console.log("fetchHeartRate: Not yet authenticated.");
    }
    var thisMoment = now();
    var startTime = dateFormat(startTimeDate, "hh:MM");
    var endTime = dateFormat(thisMoment, "hh:MM");
    var startDate = dateFormat(startTimeDate, "yyyy-mm-dd");
    var path = `/activities/heart/date/${startDate}/1d/1sec/time/${startTime}/${endTime}.json`
    console.log('Sending heart rate request');
    return client.get(path, accessToken).then(successCallback, errorCallback);
}

////////////////// SLEEP DATA //////////////////////////

var sleepDataForTime = function(date) {
    var fitbitDate = dateFormat(date, "yyyy-mm-dd");

    var sleepLog = null;
    for (var k in sleepDataByDate) {
        if (sleepDataByDate.hasOwnProperty(k)) {
            var sleepData = sleepDataByDate[k];
            for (var i=0; i<sleepData.length; i++) {
                sleepLog = sleepData[i];
                var startDate = new Date(sleepLog.startTime);
                var endDate = new Date(sleepLog.startTime);
                endDate.setMinutes(endDate.getMinutes() + sleepLog.timeInBed);
                if (date.getTime() > startDate.getTime() && date.getTime() < endDate.getTime()) {
                    break;
                } else {
                    sleepLog = null;
                }
            }
        }

        if (sleepLog !== null) break;
    }

    if (sleepLog === null) return hue.USER_STATES.DAY;

    date.setSeconds(0);
    var hms = dateFormat(date, "hh:MM:ss");
    var datum = _.find(sleepLog.minuteData, function(d) {return d.dateTime === hms});
    if (!datum) return hue.userState; // don't change sleep status if you are sleeping but don't have the data

    var sleepState = hue.USER_STATES.DAY;
    switch (datum) {
        case 1:
            sleepState = hue.USER_STATES.ASLEEP;
            break;
        case 2:
            sleepState = hue.USER_STATES.RESTLESS;
            break;
        case 3:
            sleepState = hue.USER_STATES.AWAKE;
            break;
    }

    return sleepState;
}

var clearSleepDataBefore = function(date) {
    var fitbitDate = dateFormat(date, "yyyy-mm-dd");
    var toDelete = [];
    for (var k in sleepDataByDate) {
        if (sleepDataByDate.hasOwnProperty(k)) {
            if (compareFitbitDateStrings(fitbitDate, k) > 0) toDelete.push(k);
        }
    }

    for (var i=0; i<toDelete.length; i++) delete sleepDataByDate[toDelete[i]];
}

var appendSleepDataFromResponse = function(res) {
    // This is an array of all the sleep times for that day
    var sleeps = res[0].sleep;
    var sleepDate = sleeps[0].dateOfSleep;
    sleepDataByDate[sleepDate] = [];

    // For each one, make a sleep object that contains the start time, duration and sleep minutes
    for (var i=0; i<sleeps.length; i++) {
        var sleepData = {
            startTime: sleeps[i].startTime,
            timeInBed: sleeps[i].timeInBed,
            minuteData: sleeps[i].minuteData
        }

        sleepDataByDate[sleepDate].push(sleepData);
    }
}

var refreshSleepData = function() {
    // Can't do anything if we aren't authenticated
    if (!accessToken) {
        console.log("refreshSleepData: No access token");
        return;
    }

    // Remove unnecessary sleep data, if it exists
    clearSleepDataBefore(daysAgo(1));

    // Get yesterday's sleep data
    fetchSleepData(daysAgo(1), appendSleepDataFromResponse);

    // Update today's sleep data
    fetchSleepData(now(), appendSleepDataFromResponse);
}

var updateSleepData = function() {
    var sleepTime = minutesAgo(15);
    var currentSleepState = sleepDataForTime(sleepTime);
    console.log("updateSleepData time: " + sleepTime);
    console.log("updateSleepData state: " + currentSleepState);
    hue.userState = currentSleepState;
}

var fetchSleepData = function(date, callback) {
    if (!accessToken) {
        console.log("fetchSleepData: No access token");
        return;
    }
    console.log('Sending sleep data request');

    lastSleepDataRequestTime = new Date();
    var sleepDateStr = dateFormat(date, 'yyyy-mm-dd');

    client.get(
        `/sleep/date/${sleepDateStr}.json`,
        accessToken
    ).then(callback);
}

////////////////// RUN LOOP //////////////////////////

var refreshAccessToken = function() {
    console.log("Refreshing access token");
    if (!accessToken) {
        console.log("No access token to refresh!");
    } else {
        client.refreshAccessToken(accessToken, refreshToken).then(function (result) {
            console.log("Access token refreshed");
            accessToken = result.access_token;
            refreshToken = result.refresh_token;
            expiresAt = result.expires_at;
        }, function(result) {
            console.log("Failed to refresh access token");
            console.log(result.stack);
        });
    }
}

var restartHue = function() {
    console.log("Starting hue");
    hue.isAnimating = false;
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
        console.log('Received access token');
        setAccessToken(result.access_token, result.refresh_token);
        res.redirect("/");
    }).catch(function (error) {
        res.send(error);
    });
});

app.get('/sleep', function (req, res) {
    res.send(JSON.stringify(sleepDataByDate));
});

app.get('/heartrate', function (req, res) {
    res.send(JSON.stringify(heartRateData));
});

app.get('/', function(req, res) {
    var getFitApiStatus = function(){
        return accessToken !== undefined;
    }
    res.render('index',
        {
            title: 'Hey',
            message: 'Hello there!',
            fitApiStatus: getFitApiStatus(),
            lastHeartRate: hue.heartRate,
            sleepStatus: displayStringForUserState(hue.userState),
            heartRateFetchTime: lastHeartRateRequestTime,
            sleepDataFetchTime: lastSleepDataRequestTime,
            lightOneBrightness: hue.getLightBrightness(0),
            lightTwoBrightness: hue.getLightBrightness(1)
        });
});

// launch the server
app.listen(3000, function(){
    console.log('example app listening on port 3000!');
    setInterval(refreshAccessToken, 15000);
    hue = new Hue();
    // hue.on("crash", restartHue);
    // restartHue();
    // setInterval(restartHue, 60000 * 30);

    // refreshSleepData();
    // setInterval(refreshSleepData, 60000 * 5);

    // updateSleepData();
    // setInterval(updateSleepData, 60000 * 1);
});