
var socket;

var websocket = {
    init: function() {
        socket = io();
        Object.keys(socketHandler).forEach(function(handler) {
            socket.on(handler, socketHandler[handler]);
        });
    },

    // login: function(email, password) {
    //     socket.emit("login", email, password);
    // },

    listen: function(env) {
        socket.emit("listen", env);
    },

    unlisten: function(env) {
        socket.emit("unlisten", env);
    },
};

var socketHandler = {
    connect: function() {
        console.log("Connected to server");
    },

    status: function(env, type, status, msg) {
        console.log(env, type, status, msg);
        if(type == 'start') {
            render({
                type: "status",
                env: env,
                class: "bg-success",
                title: 'Cluster Status'
            }, $("#notificationsContainer"));
        }
        else {
            var $html = $("#status-" + env);
            if(!$html.length) {
                return;
            }
            var $item = $html.find('.item-' + type);
            $item.find('img').attr('src', status ? 'images/SUCCESS.png' : 'images/nobuilt.png');
            $item.find('.msg').text(' - ' + msg);
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
        switch(type) {
            case 'container':
                $("#" + id).remove();
                break;
                
            case 'service':
                $("#" + id).remove();
                break;
            
            case 'node':
                $("." + id).remove();
                break;
        }
    },

    ecr: function(env, repositoryName, tag) {
        tag.tags.forEach(function(currentTag) {
            updateRegistryTag(env, repositoryName, currentTag, tag)
        });
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

    test: function(build) {
        updateTest(build);
    },
};

