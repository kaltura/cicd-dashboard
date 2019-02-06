
const fs = require('fs');
const elasticSearch = require('elasticsearch');

const permissions = {
    Administrator: [
        'login'
    ]
}

const api = {
    regex: /^[^\/]+\/([^:\/]+):([^@]+)@sha256:(.+)$/g,

    init: (logger, config) => {
        api.logger = logger;
        const flowPath = __dirname + '/../config/flow.json';
        api.flowData = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
        fs.watchFile(flowPath, () => {
            fs.readFile(flowPath, 'utf8', (err, data) => {
                if(data && !err) {
                    api.flowData = JSON.parse(data);
                    api.jenkins.flowData = api.flowData;
                }
            });
        });
        api.registry = require('./ecr')(logger, config);
        api.model = require('./model')(logger, config);
        api.jenkins = require('./jenkins')(api.flowData, logger, config);
        
        api.elasticSearchClient = new elasticSearch.Client({
            host: config.elasticSearchUrl,
            log: 'info'
        });
    },

    handle: (req, res, action, data) => {
        if(api[action]) {
            let method = api[action];
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
                    permissions: permissions[user.userRole],
                };
                req.session.user = userData;
                return Promise.resolve(userData);
            }
        );
    },

    build: (req, res, {job, parameters}) => {
        return api.jenkins.build(job, parameters);
    },

    flow: () => {
        return Promise.resolve(api.flowData);
    },

    ecr: () => {
        return Promise.resolve(api.registry.status);
    },

    jobs: () => {
        return Promise.resolve(api.jenkins.jobs);
    },

    containers: () => {
        return api.elasticSearchClient.search({
            index: 'status-container',
            size: 1000
        })
        .then(filterOldResults)
        .then(data => {
            return Promise.resolve(
                data.map(item => {
                    var value = {
                        Id: item.Id,
                        env: item.env,
                        type: item.type,
                        dead: item.State.Dead,
                        running: item.State.Running,
                        startedAt: item.State.StartedAt,
                        restarting: item.State.Restarting,
                        labels: item.Config.Labels,
                        image: item.Config.Image,
                        timestamp: item["@timestamp"],
                        serviceName: item.Config.Labels["com.docker.swarm.service.name"],
                        serviceId: item.Config.Labels["com.docker.swarm.service.id"],
                        namespace: item.Config.Labels["com.docker.stack.namespace"],
                        nodeId: item.Config.Labels["com.docker.swarm.node.id"],
                        version: item.Config.Labels.version,
                    };
                    
                    var matches = api.regex.exec(value.image);
                    if(Array.isArray(matches)) {
                        value.app = matches[1];
                        value.tag = matches[2];
                        value.digest = matches[3];
                        
                        if(value.tag.match(/^linux-/)) {
                            data["tag-prefix"] = "linux";
                        }
                        if(value.tag.match(/^windows-/)) {
                            value["tag-prefix"] = "windows";
                        }
                        value.kaltura = true;
                    }
                    else {
                        value.kaltura = false;
                    }
                    return value;
                })
            );
        });
    },

    services: () => {
        return api.elasticSearchClient.search({
            index: 'status-service',
            size: 1000
        })
        .then(filterOldResults);
    },

    nodes: () => {
        return api.elasticSearchClient.search({
            index: 'status-node',
            size: 1000
        })
        .then(filterOldResults);
    }
}


const halfAnHour = 10 * 60 * 1000;
function filterOldResults(data) {
    var now = new Date().getTime();
    var hits = data.hits.hits
    .filter(hit => {
        var timestamp = new Date(hit._source['@timestamp']).getTime();
        var diff = now - timestamp;
        if(diff > halfAnHour) {
            api.logger.log(`Deleting old doc [${hit._id}]`)
            api.elasticSearchClient.delete({
                index: hit._index,
                type: hit._type,
                id: hit._id
            })
            .catch(err => {
                api.logger.error(err.message);
            });
            return false;
        }
        return true;
    })
    .map(hit => hit._source);

    return Promise.resolve(hits);
}

module.exports = (logger, config) => {
    api.init(logger, config)
    return api;
};