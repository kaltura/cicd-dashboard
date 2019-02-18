
var socket;

var websocket = {
    init: function() {
        socket = io();
        Object.keys(socketHandler).forEach(function(handler) {
            socket.on(handler, socketHandler[handler]);
        });
    },

    login: function(email, password) {
        socket.emit("login", email, password);
    },

    listen: function(env) {
        socket.emit("listen", env);
    },

    unlisten: function(env) {
        socket.emit("unlisten", env);
    },
};

var socketHandler = {
    flowBuilt: false,

    connect: function() {
        console.log("Connected to server");
        pop({type: "login"});
    },

    user: function(user) {
        // console.log(user);
    },

    flow: function(data) {
        if(!socketHandler.flowBuilt) {
            socketHandler.flowBuilt = true;
            data.forEach(function(item) {
                render(item, null);
            });
        }
    },

    container: function(data) {
        updateStatus(data);
    },

    service: function(data) {
        updateStatus(data);
    },

    node: function(data) {
        updateStatus(data);
    },

    delete: function(type, id) {
        console.log('delete', type, id);
    },

    ecr: function(env, repositoryName, tag) {
        console.log('ecr', env, repositoryName, tag);
    },

    job: function(job) {
        updateJenkinsJob(job);
    },

    jobBuild: function(job) {
        updateJenkinsJob(job);
    },

    deploy: function(deploy) {
        updateDeploy(deploy);
    },

    deployBuild: function(build) {
        updateDeploy(build);
    },
};

