
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const session = require('express-session');
const fileUpload = require('express-fileupload');


const config = JSON.parse(fs.readFileSync('config/config.json'));
const logger = console;

const api = require('./lib/api')(logger, config);
const files = require('./lib/files')(logger, config);

const privateKey = fs.readFileSync('ssl-dev/key.pem', 'utf8');
const certificate = fs.readFileSync('ssl-dev/certificate.pem', 'utf8');
const credentials = {key: privateKey, cert: certificate};

const app = express();
const port = process.env.PORT || 80;
const secPort = process.env.SEC_PORT;

process.on('uncaughtException', err => {
    logger.error('Uncaught Exception: ' + err.stack);
});

function requiresLogin(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    } else {
        var err = new Error('You must be logged in to view this page.');
        err.status = 401;
        return next(err);
    }
}

app.use(session({
    secret: 'OTT fun',
    resave: true,
    saveUninitialized: false
}));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.use(express.static(path.join(__dirname, '/public')));

app.use(fileUpload({
    // limits: { fileSize: 50 * 1024 * 1024 },
    preserveExtension: true,
}));

app.post('/upload', function(req, res) {
    files.upload(req.body, req.files, res); // the uploaded file object
});

app.get('/api/*', requiresLogin, (req, res) => {
    let parts = req.path.split('/');
    let action = parts[2];
    api.handle(req, res, action);
});

app.use(express.json());
  
app.post('/api/login', (req, res) => {
    let parts = req.path.split('/');
    let action = parts[2];
    api.handle(req, res, action, req.body);
});

app.post('/api/*', requiresLogin, (req, res) => {
    let parts = req.path.split('/');
    let action = parts[2];
    api.handle(req, res, action, req.body);
});

app.get(['', '/', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, '/public', 'index.html'));
});
  
var httpServer = http.createServer(app);
httpServer.listen(port, () => {
  logger.log(`Server running on port ${port}`);
});

if(secPort) {
    var httpsServer = https.createServer(credentials, app);
    httpsServer.listen(secPort, () => {
    logger.log(`Server running on port ${secPort}`);
    });
}