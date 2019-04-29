
const fs = require('fs');

const api = {
    init: (modules) => {
        api.mail = modules.mail;
        api.model = modules.model;
        api.config = modules.config;
        api.logger = modules.logger;
        api.search = modules.search;
        api.jenkins = modules.jenkins;
        api.registry = modules.registry;
        api.permissions = modules.permissions;
        api.deployUtils = modules.deploy;
    },

    start: (io) => {
        api.io = io;
        
        api.loadFlow();
        
        fs.watch(__dirname + '/../config/envs', api.loadFlow);
        fs.watch(__dirname + '/../config/flow.json', api.loadFlow);
    },

    loadFlow: () => {   
        api.envs = {};     
        api.flowData = JSON.parse(fs.readFileSync(__dirname + '/../config/flow.json', 'utf8'));
        let envsDir = __dirname + '/../config/envs';
        fs.readdirSync(envsDir)
        .map(file => JSON.parse(fs.readFileSync(`${envsDir}/${file}`)))
        .forEach(env => {
            api.addEnv(env);
            api.registry.addEnv(env);
            api.io.emit('env', env);
        });
    },

    addEnv: (env) => {
        if(!env.parent) {
            return;
        }

        if(!api.envs[env.parent]) {
            api.envs[env.parent] = [];
        }
        api.envs[env.parent].push(env);
    },

    status: (env, res, {src, tag}) => {
        return api.deployUtils.deploy(src, tag)
    },

    env: (env, res) => {
        if(env.permissions) {
            Object.keys(env.permissions).forEach(role => {
                if(!api.permissions[role]) {
                    api.permissions[role] = {};
                }
                Object.keys(env.permissions[role]).forEach(permission => {
                    api.permissions[role][permission] = true;
                });
            })
            fs.writeFileSync(__dirname + `/../config/permissions.json`, JSON.stringify(api.permissions, null, 2));
        }
        fs.writeFileSync(__dirname + `/../config/aws/${env.env.tag}.json`, JSON.stringify(env.aws, null, 2));
        fs.writeFileSync(__dirname + `/../config/envs/${env.env.tag}.json`, JSON.stringify(env.env, null, 2));

        api.deployUtils.deploy(env.env.src, env.env.tag, true).then(() => {
            res.send('ok');
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

    hasPermission: (req, permission) => {     
        if (req.session && req.session.user && req.session.user.permissions) {
            if(req.session.user.permissions === '*' || req.session.user.permissions[permission]) {
                return true;
            }        
        }
        
        if(api.permissions.Anonymous[permission]) {
            return true;
        }

        api.logger.log(`Missing permission: ${permission}`);
        return false;
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
                    email: email,
                    username: user.username,
                    permissions: api.permissions[user.userRole],
                };
                req.session.user = userData;
                return Promise.resolve(userData);
            }
        );
    },

    impersonateUser: (req, res, {email}) => {
        const master = req.session.user;
        return api.model.User.GetByMail(email)
        .then(
            user => {
                var userData = {
                    email: email,
                    username: user.username,
                    permissions: api.permissions[user.userRole],
                    master: master
                };
                req.session.user = userData;
                return Promise.resolve(userData);
            }
        );
    },

    unimpersonateUser: (req) => {
        if(req.session.user.master) {
            const master = req.session.user.master;
            req.session.user = master;
            return Promise.resolve(master);
        }
        else {
            return Promise.reject('User is not impersonated');
        }
    },

    forgotPassword: (req, res, {email}) => {
        const password = Math.random().toString(36).slice(-8);
        const updateInfo = `${req.protocol}://${req.hostname}#update-info`;
        return api.model.User.GetByMail(email)
        .then(
            user => api.model.User.UpdatePassword(user, password).then(api.mail.send(email, 'CI/CD Dashboard Password Reset', 'password-reset', {password: password, updateInfo: updateInfo})),
            err => Promise.reject(err)
        );
    },

    updateMyDetails: (req, res, user) => {
        const email = req.session.user.email;
        return api.model.User.Update(email, user);
    },

    updateUser: (req, res, {email, user}) => {
        return api.model.User.Update(email, user);
    },

    deleteUser: (req, res, {email}) => {
        return api.model.User.Delete(email);
    },

    frame: (req, res, {parentId}) => {
        return Promise.resolve(api.envs[parentId]);
    },

    register: (req, res, {email}) => {
        const acceptUrl = `${req.protocol}://${req.hostname}?email=${email}#accept-register`;
        return api.model.User.GetByMail(email)
            .then(
                userExists => Promise.reject('E-mail already in use'),
                noUserFound => api.mail.send(api.config.mail.admin, 'CI/CD Dashboard Registration Request', 'register-request', {email: email, accept: acceptUrl})
            )
            .then(ok => api.mail.send(email, 'CI/CD Dashboard Registration', 'register'));
    },

    createUser: (req, res, {email, role}) => {
        const password = Math.random().toString(36).slice(-8);
        const updateInfo = `${req.protocol}://${req.hostname}#update-info`;
        return api.model.User.Add(email, email.replace(/@.+$/, '').replace('.', ' '), password, role)
            .then(
                createdUser => api.mail.send(email, 'CI/CD Dashboard Registration Approved', 'register-approved', {password: password, updateInfo: updateInfo}),
                err => Promise.reject(err)
            );
    },

    build: (req, res, {job, env, parameters}) => {
        if(!env) {
            env = 'rnd';
        }
        if(!api.hasPermission(req, `${env}-build`)) {
            return Promise.reject(`Missing permission`);
        }
        return api.jenkins.build(job, parameters);
    },

    deploy: (req, res, data) => {
        var {tag, src, app, os, tagPrefix} = data;

        if(!api.hasPermission(req, `${tag}-deploy`)) {
            return Promise.reject(`Missing permission`);
        }

        var jobName = 'Push-Docker';
        var parameters = {};
        if(app && os) {
            var latest = tagPrefix ? tagPrefix + '-latest' : 'latest';
            parameters = {
                from_image: data.from_image ? data.from_image : `${src}-${app}:${latest}`,
                to_image: data.to_image ? data.to_image : `${tag}-${app}:${latest}`,
            }
            jobName += '-' + os;
        }
        
        return api.jenkins.deploy(jobName, src, tag, parameters);
    },

    getFlow: () => {
        return api.flowData;
    },

    flow: (req) => {
        if (req.session && req.session.user && req.session.user.permissions) {            
            return Promise.resolve(filterFlow(api.flowData, req.session.user.permissions));
        }
        else {
            return Promise.reject('Flow requires login');
        }        
    },

    user: (req) => {
        if (req.session && req.session.user) {            
            return Promise.resolve(req.session.user);
        }
        else {
            return Promise.reject('User info requires login');
        }        
    },

    roles: () => {
        var roles = Object.keys(api.permissions);
        roles.shift();
        return Promise.resolve(roles);
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
    },

    users: (req, res) => {
        return api.model.User.List();
    }
}

function filterFlow(flow, permissions) {
    if(permissions === '*') {
        return flow;
    }

    return flow.map(item => {
        if(item.requiredPermissions && item.requiredPermissions.read) {
            if(Array.isArray(item.requiredPermissions.read)) {
                if(item.requiredPermissions.read.filter(permission => permissions[permission]).length === 0) {
                    return null;
                }
            }
            else if(!permissions[item.requiredPermissions.read]) {
                return null;
            }
        }
        var ret = JSON.parse(JSON.stringify(item));
        if(item.items) {
            ret.items = filterFlow(item.items, permissions);
        }
        return ret;
    })
    .filter(item => item);
}

module.exports = (modules) => {
    api.init(modules)
    return api;
};