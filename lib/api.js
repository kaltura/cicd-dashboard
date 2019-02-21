
const fs = require('fs');

const api = {
    init: (modules) => {
        api.mail = modules.mail;
        api.model = modules.model;
        api.logger = modules.logger;
        api.search = modules.search;
        api.jenkins = modules.jenkins;
        api.registry = modules.registry;
        api.permissions = modules.permissions;

        const flowPath = __dirname + '/../config/flow.json';
        api.flowData = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
        fs.watchFile(flowPath, () => {
            fs.readFile(flowPath, 'utf8', (err, data) => {
                if(data && !err) {
                    api.flowData = JSON.parse(data);
                }
            });
        });
    },

    handle: (req, res, action, data) => {
        if(api[action]) {
            let method = api[action];
            // api.logger.log(`API ${action}`, data);
            method(req, res, data)
            .then(
                response => res.send(response), 
                err => {
                    api.logger.error(`API [${action}] failed:`, err);
                    res.statusMessage = err;
                    res.status(500).end();
                }
            );
        }
        else {
            api.logger.error(`API action [${action}] not found`);
            res.statusMessage = `API action ${action} not found`;
            res.status(404).end();
        }
    },

    logout: (req, res) => {
        req.session.destroy();
        return Promise.resolve(true);
    },

    login: (req, res, {email, password}) => {
        return api.model.User.Authenticate(email, password)
        .then(
            user => {
                var userData = {
                    username: user.username,
                    permissions: api.permissions[user.userRole],
                };
                req.session.user = userData;
                return Promise.resolve(userData);
            }
        );
    },

    register: (req, res, {email}) => {
        const token = new Buffer(`register:${email}`).toString('base64');
        const acceptUrl = `${req.protocol}://${req.hostname}/actions/accept.html?token=${token}`;
        return api.model.User.GetByMail(email)
            .then(
                userExists => Promise.reject('E-mail already in use'),
                noUserFound => api.mail.send(email, 'CI/CD Dashboard Registration', 'register-request', {email: email, accept: acceptUrl})
            )
            .then(ok => api.mail.send(email, 'CI/CD Dashboard Registration', 'register'));
    },

    build: (req, res, {job, parameters}) => {
        return api.jenkins.build(job, parameters);
    },

    deploy: (req, res, data) => {
        var {tag, src, app, os, tagPrefix} = data;

        var jobName = 'Push-Docker';
        var parameters = {};
        if(app && os) {
            var latest = tagPrefix ? tagPrefix + '-latest' : 'latest';
            parameters = {
                from_image: `${src}-${app}:${latest}`,
                to_image: `${tag}-${app}:${latest}`,
            }
            jobName += '-' + os;
        }
        
        return api.jenkins.deploy(jobName, src, tag, parameters);
    },

    getFlowObjects: (objects, objectType) => {
        var ret = [];
        objects.forEach(item => {
            if(item.type == objectType) {
                ret.push(item);
            }
            else if (item.items) {
                ret = ret.concat(api.getFlowObjects(item.items, objectType));
            }
        });

        return ret;
    },

    getFlow: (objectType) => {
        if(objectType) {
            return api.getFlowObjects(api.flowData, objectType);
        }
        else {
            return api.flowData;
        }
    },

    flow: () => {
        return Promise.resolve(api.flowData);
    },

    ecr: (req, res, {env}) => {
        return Promise.resolve(api.registry.status[env]);
    },

    jobs: () => {
        return api.search.jobs();
    },

    deployments: (req, res, {env}) => {
        return api.search.deployments(env);
    },

    tests: (req, res, {env}) => {
        return api.search.tests(env);
    },

    containers: (req, res, {env}) => {
        return api.search.containers(env);
    },

    services: (req, res, {env}) => {
        return api.search.services(env);
    },

    nodes: (req, res, {env}) => {
        return api.search.nodes(env);
    }
}

module.exports = (modules) => {
    api.init(modules)
    return api;
};