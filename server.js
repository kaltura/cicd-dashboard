
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const socketIo = require('socket.io')
const fileUpload = require('express-fileupload');
const sharedsession = require("express-socket.io-session");

const session = require('express-session')({
    secret: 'OTT fun',
    resave: true,
    saveUninitialized: false
});

var modules = {
    logger: console,
    config: JSON.parse(fs.readFileSync('config/config.json')),
    permissions: JSON.parse(fs.readFileSync('config/permissions.json')),
}
modules.mail = require('./lib/mail')(modules);
modules.files = require('./lib/files')(modules);
modules.registry = require('./lib/ecr')(modules);
modules.model = require('./lib/model')(modules);
modules.jenkins = require('./lib/jenkins')(modules);
modules.search = require('./lib/search')(modules);
modules.api = require('./lib/api')(modules);
modules.websocket = require('./lib/websocket')(modules);

const app = express();
const port = process.env.PORT || 80;

process.on('uncaughtException', err => {
    modules.logger.error('Uncaught Exception: ' + err.stack);
});

function requiresLogin(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    
    let parts = req.path.split('/');
    let action = parts[2];
    if(modules.permissions.Anonymous[action]) {
        return next();
    }

    var err = new Error('You must be logged in to view this page.');
    err.status = 401;
    return next(err);
}

app.use(session);

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
    modules.files.upload(req.body, req.files, res); // the uploaded file object
});

app.get('/api/*', requiresLogin, (req, res) => {
    let parts = req.path.split('/');
    let action = parts[2];
    modules.api.handle(req, res, action);
});

app.use(express.json());
  
const apiHandler = (req, res) => {
    let parts = req.path.split('/');
    let action = parts[2];
    modules.api.handle(req, res, action, req.body);
}

app.post('/api/*', requiresLogin, apiHandler);

app.get(['', '/', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, '/public', 'index.html'));
});
  
const httpServer = http.createServer(app);
const io = socketIo(httpServer);
io.use(sharedsession(session, {
    autoSave:true
})); 
io.on('connection', modules.websocket.onNewClient);
httpServer.listen(port, () => {
    modules.logger.log(`Server running on port ${port}`);
});

modules.search.start(io);
modules.registry.start(io);