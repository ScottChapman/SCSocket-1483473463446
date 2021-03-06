/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');
var http = require('http');
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
var textParser = bodyParser.text();
var mqtt = require('mqtt')
var _ = require('lodash');
// var client  = mqtt.connect('mqtt:192.168.86.10')
var client  = mqtt.connect('mqtt:scottchapman.no-ip.org')
var swaggerUI = require('swagger-ui-express');
var swaggerDoc = require('./swagger.json');
var OneColor = require('onecolor');
var boolifyString = require('boolify-string');

// colors
// bri	uint8	The brightness value to set the light to.
// Brightness is a scale from 1 (the minimum the light is capable of) to 254 (the maximum). Note: a brightness of 1 is not off.
//
// e.g. “brightness”: 60 will set the light to a specific brightness
//
// Optional
// hue	uint16	The hue value to set light to.
// The hue value is a wrapping value between 0 and 65535. Both 0 and 65535 are red, 25500 is green and 46920 is blue.
//
// e.g. “hue”: 50000 will set the light to a specific hue.
var colors = {
  red: {bri: 254, hue: 0, sat: 254},
  green: {bri: 254, hue: 25500, sat: 254},
  blue: {bri: 254, hue: 46920, sat: 254},
}

var hubKeys = {
  "9.32.241.244": "N6ZMYDGSMy4dyJi2M8xB4JJ6uP49bwM77TLa149S",
  "9.32.235.253": "N6ZMYDGSMy4dyJi2M8xB4JJ6uP49bwM77TLa149S",
  "9.53.24.197": "XurcL3CkWz6xhAPswke9X8dq10oTAUysogbee8ra"
};

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

// create a new express server
var app = express();

app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerDoc));

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

// body parser
// app.use(bodyParser.json());

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

app.get('/Hub/:hubname', function(req,res) {
  var hubname = req.params.hubname;
  if (hubs.hasOwnProperty(hubname)) {
    res.status(200).send(hubs[hubname]).end();
  }
  else {
    res.status(400).send({status: "hubname not found"}).end();
  }
})

app.get('/Hubs', function(req,res) {
  res.status(200).send(_.keys(hubs)).end();
})

function GetLightByName(lightname, callback) {
  var found = false;
  console.log("Looking for light: " + lightname);
  _.keys(hubs).forEach(function (hub) {
    if (found) return;
    _.keys(hubs[hub].lights).forEach(function (lightnum) {
      if (found) return;
      var light = hubs[hub].lights[lightnum];
      console.log("Checking: " + light.name);
      if (light.name.toUpperCase() === lightname.toUpperCase()) {
        console.log("found!");
        light.hub = hubs[hub].config;
        light.number = lightnum;
        callback(null, light);
        found = true;
      }
    })
  });
  if (!found) callback(true, "No light found");
}

app.get('/Light/:lightname', function(req,res) {
  var lightname = req.params.lightname;
  GetLightByName(lightname, function(err, light) {
    if (err) {
      console.log("NOT found!");
      res.status(400).send({status: "Light not found"}).end();
    }
    else {
      console.log("found!");
      res.status(200).send(light).end();
    }
  })
})

function expand(state, callback) {
  var error = null;
  if (state.hasOwnProperty("color")) {
    var color = OneColor(state.color);
    if (color) {
      _.assign(state, toHSB(color));
      delete state.color;
    }
    else {
       error = "No such color: " + state.color
    }
  }
  if (!state.hasOwnProperty("On"))
    state.on = true;
  if (!state.hasOwnProperty("transitiontime"))
    state.transitiontime = 0;
  callback(error,state);
}

var statusColors = {
  "green": "green",
  "red": "red",
  "good": "green",
  "bad": "red",
  "up": "green",
  "down": "red",
}

var statusLightList = [
  "Scott Bloom",
  "Jim Bloom",
  "Bruce Bloom",
  "David Bloom",
  "Miguel Bloom",
  "Vijay Bloom"
];

function setPipelineStatusLights(status) {
  status = status.toLowerCase();
  if (statusColors.hasOwnProperty(status)) {
    var body = {color: statusColors[status]};
    statusLightList.forEach(function(lightname) {
      GetLightByName(lightname, function(err, light) {
        if (!err) {
          expand(body, function(error, state) {
            if (!error) {
                var message = {
                  state: state,
                  light: light,
                  key: hubKeys[light.hub.ipaddress],
                };
                console.dir(message);
                client.publish('SetLightState',JSON.stringify(message));
              }
            })
          }
        })
      })
    }
}

app.post('/PipelineStatus', jsonParser, function(req,res) {
  var body = req.body;
  if (body.hasOwnProperty("Status")) {
    integrationPipelineStatus = body.Status;
    setPipelineStatusLights(integrationPipelineStatus);
    res.status(200).send({status: "Accepted"}).end();
  }
  else {
    res.status(400).send({status: "Bad Request"}).end();
  }
})

app.get('/PipelineStatus', jsonParser, function(req,res) {
  res.status(200).send({Status: integrationPipelineStatus}).end();
})

app.post('/Light/:lightname', jsonParser, function(req,res) {
  var lightname = req.params.lightname;
  var body = req.body;
  GetLightByName(lightname, function(err, light) {
    if (!err) {
        expand(body, function(error, state) {
          if (!error) {
            var message = {
              state: state,
              light: light,
              key: hubKeys[light.hub.ipaddress],
            };
            client.publish('SetLightState',JSON.stringify(message));
            res.status(200).send({status: "Light State Update Request sent"}).end();
            console.log("Sending Message!");
            console.dir(message);
          }
          else {
            res.status(400).send(error).end();
          }
        })
      }
      else {
        console.log("NOT found!");
        res.status(400).send({status: "Light not found"}).end();
      }
    })
})

app.post('/Power/:lightname/:state', function(req,res) {
  var lightname = req.params.lightname;
  var state = req.params.state;
  GetLightByName(lightname, function(err, light) {
    if (!err) {
        var body = {"on": boolifyString(state)};
        expand(body, function(error, state) {
          if (!error) {
            var message = {
              state: state,
              light: light,
              key: hubKeys[light.hub.ipaddress],
            };
            client.publish('SetLightState',JSON.stringify(message));
            res.status(200).send({status: "Light State Update Request sent"}).end();
            console.log("Sending Message!");
            console.dir(message);
          }
          else {
            console.log("Error: " + error);
            res.status(400).send(error);
          }
        })
      }
      else {
        console.log("NOT found!");
        res.status(400).send({status: "Light not found"}).end();
      }
    })
})

function toHSB(color) {
  return {
    hue: Math.round(color.hue()*65535),
    bri: Math.round(color.lightness() * 254),
    sat: Math.round(color.saturation() * 254)
  }
}

/*
app.post('/Color/:lightname', textParser, function(req,res) {
  var lightname = req.params.lightname;
  var body = req.body;
  var color = OneColor(body);
  if (color) {
    GetLightByName(lightname, function(err, light) {
      if (!err) {
          var message = {
            state: toHSB(color),
            light: light,
            key: hubKeys[light.hub.ipaddress],
          };
          client.publish('SetLightState',JSON.stringify(message));
          res.status(200).send({status: "Light State Update Request sent"}).end();
          console.log("Sending Message!");
          console.dir(message);
          found = true;
        }
        else {
          console.log("NOT found!");
          res.status(400).send({status: "Light not found"}).end();
        }
      })
  }
  else {
    console.log("Color not found");
    res.status(400).send({status: "color not found"}).end();
  }
})
*/

app.post('/Color/:lightname/:color', textParser, function(req,res) {
  var lightname = req.params.lightname;
  var body = {color: req.params.color};
  GetLightByName(lightname, function(err, light) {
    if (!err) {
      expand(body, function(error, state) {
        if (!error) {
            var message = {
              state: state,
              light: light,
              key: hubKeys[light.hub.ipaddress],
            };
            client.publish('SetLightState',JSON.stringify(message));
            res.status(200).send({status: "Light State Update Request sent"}).end();
            console.log("Sending Message!");
            console.dir(message);
            found = true;
          }
          else {
            console.log("error: " + error);
            res.status(400).send(error).end();
          }
        })
      }
      else {
        console.log("NOT found!");
        res.status(400).send({status: "Light not found"}).end();
      }
    })
})

/*
app.post('/SetColor', function (req,res) {
  var body = req.body;
  var required = ['color','light'];
  console.log("Yay!");
  console.dir(body);
  if (required.length == _.intersection(required,_.keys(body)).length) {
    if (colors.hasOwnProperty(body.color)) {
      var color = colors[body.color];
      color.on = true;
      color.transitiontime = 0;
      client.publish(body.light,JSON.stringify(color));
      color.light = body.light;
      client.publish('lights',JSON.stringify(color));
      res.status(200).send({status: "All set!"}).end();
    }
    else {
      res.status(400).send({status: "color not supported"}).end();
    }
  }
  else {
    res.status(400).send({status: "missing required fields (color, light)"}).end();
  }
})
*/

var integrationPipelineStatus = "Down";

var hubs = {};

client.subscribe('HubConfig/+');

client.on('message', function(topic, message) {
  try {
    var obj = JSON.parse(message);
    if (obj.hasOwnProperty('config') && obj.config.hasOwnProperty('whitelist'))
    	delete obj.config.whitelist;
    hubs[obj.config.name] = obj;
    console.log("Got config for: " + obj.config.name);
  }
  catch (err) {
    console.log("ERROR: " + err);
  }
  // console.dir(obj);
})
// start server on the specified port and binding host
var httpServer = http.createServer(app).listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});
