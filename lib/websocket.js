
const fs = require('fs');

class SocketClient {

    constructor(socket) {
        const This = this;
        This.socket = socket;
        This.permissions = websocket.permissions.Anonymous;
        if(socket.handshake.session && socket.handshake.session.user) {
            This.permissions = socket.handshake.session.user.permissions;
        }
        Object.getOwnPropertyNames(SocketClient.prototype)
        .filter(name => typeof This[name] === 'function')
        .forEach(action => socket.on(action, function() {
            if(This.permissions[action]) {
                This[action].apply(This, arguments);
            }
            else {
                websocket.logger.log(`Action ${action} not permitted to user ${This.username}`);
            }
        }));
    }

    login(email, password) {
        const This = this;
        websocket.model.User.Authenticate(email, password)
        .then(
            user => {
                This.username = user.username;
                This.permissions = websocket.permissions[user.userRole];
                This.socket.emit('user', {
                    username: This.username,
                    permissions: This.permissions
                });
                This.socket.emit('flow', websocket.api.getFlow());
            }
        );
    }
    
    listen(env) {
        this.socket.join(env);
    }

    unlisten(env) {
        this.socket.leave(env);
    }
}

const websocket = {
    init: (modules) => {
        websocket.api = modules.api;
        websocket.model = modules.model;
        websocket.logger = modules.logger;
        websocket.permissions = modules.permissions;
    },

    onNewClient: (socket) => {
        new SocketClient(socket);
    },
}

module.exports = (modules) => {
    websocket.init(modules)
    return websocket;
};