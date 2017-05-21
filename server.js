var https = require('https');
var express = require('express');
var path = require('path');
var sassMiddleware = require('node-sass-middleware');
var mongo = require('mongodb').MongoClient;

var portToUse = process.env.PORT || 8080;
var mongoURL = process.env.MONGO_URL || require('./keys.js').MONGO_URL;
var googAPI = process.env.API_KEY || require('./keys.js').API_KEY;
var googCX = process.env.XC_KEY || require('./keys.js').CX_KEY;

var app = express();

app.use(sassMiddleware(path.join(__dirname, 'views')));
app.use(express.static(path.join(__dirname, 'views')));

app.get('/api/imagesearch/*', function(req,res) {
    
    if (req.url == '/api/imagesearch/') {
        getSearchLog(res);
    } else {
        res.end("For now, not doing this");
        formatSearch(req, res);                             // assume it's a valid search
    }
});

function formatSearch(req,res) {                            // prepare to get a search
    
    var searchStr = "";
    var offset = 1;
    var reqURL = req.url.substr('/api/imagesearch/'.length);
    
    if(/\?offset=[\S]*$/.test(reqURL)) {                    // if there's an offset ...
        var regMatch = reqURL.match(/(.*)\?offset=([\S]*)$/);
        searchStr = regMatch[1];
        var candOffset = regMatch[2];
        if(!isNaN(candOffset) && candOffset != "" && candOffset >= 0) {
            offset = parseInt(candOffset) + 1;
        }
    } else {
        searchStr = reqURL;
    }
    
    if(searchStr != "") {
        sendSearch(searchStr, offset, res);                 // ready, go for a search
    } else {
        res.end("ERROR: no search term provided");          // we ended up with null search
    }
}

function sendSearch(searchStr, offset, res) {
    
    console.log(searchStr, offset);
    
    var url1 = "https://www.googleapis.com/customsearch/v1?key=";
    var url2 = "&cx=";
    var url3 = "&q=";
    var url4 = "&searchType=image&start="
    var url = url1 + googAPI + url2 + googCX + url3 + searchStr + url4 + offset;
    
    console.log(url);
    
    var aggr = ""                                       // will hold response data until re-JSON'd
    
    https.get(url, function(response) {
        response.setEncoding('utf8');                   // remove need to deal with a buffer, get strings instead
   
        response.on("data", function(data) {            // if we have data, store it 
          aggr = aggr + data;
        });
   
        response.on("error", function(error) {console.log(error)});
   
        response.on("end", function() {                 // we now have all the data ...
       
            var jsonData = JSON.parse(aggr);            // ... so put it back into a JSON ...
            
            var retArr = [];                            // ... make an empty array to hold info ...
            
            for (var i = 0; i < jsonData['items'].length; i++) {
                
                var tempImg = jsonData['items'][i];     // ... get a temp pointer to the info ...
                
                var tempObj = {                         // ... make an object with keys/values we want ...
                    'url' :      tempImg['link'],
                    'snippet':   tempImg['snippet'],
                    'thumbnail': tempImg['image']['thumbnailLink'],
                    'context':   tempImg['image']['contextLink']
                }
                
                retArr.push(tempObj);                   // ... and add it to the retArr
            }
            
            res.json(retArr);
            addSearchToLog(searchStr);                  // now we're done, add the search to log
        });
    
    });
}

function addSearchToLog(searchStr) {
    
    var currentDate = new Date();
    var timeStamp = currentDate.getTime();
    
    var newDoc = {
        "term": searchStr.replace(/%20/g, " "),
        "when": currentDate.toDateString() + " " + currentDate.toTimeString(),
        "timestamp": timeStamp
    }
    
    mongo.connect(mongoURL, function(err, db) {
        
        if(err) {console.log(err)}
    
        var collection = db.collection('fcc24log');     // get the log collection ...

        collection.insert(newDoc, function(err, data) { // ... and insert newDoc

            if(err) throw err;

            db.close();
        })
                
    });
    
}

function getSearchLog(res) {
    
    mongo.connect(mongoURL, function(err, db) {         // connect to the database
        
        if(err) {console.log(err)}                      // deal with error
    
        var collection = db.collection('fcc24log');     // get the log collection ...

        var results = collection.find({}).toArray( function(err, docs) {
            
            if(err) console.log(err);
            
            if(docs.length == 0) {                      // nothing was found, error out
                res.end("ERROR: no search history found");
                db.close();
            } else {
                
                docs.sort((a,b) => b.timestamp - a.timestamp);
                var last = docs.length;
                var retArr = [];
                
                for (var i = 0; i < Math.min(10, last); i++) {
                    
                    var tempObj = {                     // cycle through max 10 and make array
                        "term" : docs[i].term,
                        "when" : docs[i].when
                    }
                    retArr.push(tempObj);
                }
                
                res.json(retArr);
                
                if (last > 10) {                        // we only want to keep 10 items
                    
                    collection.remove({
                        timestamp: {$lt: docs[9].timestamp}
                    }, function(err) {
                        if(err) throw err;
                        db.close();
                    });
                    
                } else {
                    db.close();
                }
                
            }
            
        });
                
    });
    
}

app.listen(portToUse, function() {
    console.log("Server started, listening on port", portToUse);
});