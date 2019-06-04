
const fs = require('fs');
const ws = require('ws');
const elasticSearch = require('elasticsearch');

const dataMapper = {
    container: (item) => {
        let data = {
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
        
        let regex = /^[^\/]+\/([^:\/]+):([^@]+)@sha256:(.+)$/;
        let matches = regex.exec(data.image);
        if(matches) {
            data.app = matches[1];
            data.tag = matches[2];
            data.digest = matches[3];            
            data.kaltura = true;
        }
        else {
            data.kaltura = false;
        }

        return data;
    },
    
    service: (item) => {
        let data = {
            Id: item.Id,
            env: item.env,
            type: item.type,
            name: item.Spec.Name,
            labels: item.Spec.Labels,
            image: item.Spec.Labels["com.docker.stack.image"],
            namespace: item.Spec.Labels["com.docker.stack.namespace"],
            timestamp: item["@timestamp"],
        };

        let regex = /^.+\/([^:\/]+):([^@]+)(@sha256:(.+))?$/g;
        let matches = regex.exec(item.Spec.TaskTemplate.ContainerSpec.Image);
        if(matches) {
            data.app = matches[1];
            data.tag = matches[2];
            data.digest = matches[4];
        }
        else {
            search.logger.error("Couldn't parse service image name: " + data.image);
        }
        
        return data;
    },

    test: (item) => {
        if(!item.message) {
            return {
                id: item.objectId,
                env: item.env,
                lastUpdate: item['@timestamp']
            };
        }

        let suites = (typeof item.message.suites != 'object') ? [] : Object.keys(item.message.suites).map(suiteName => {
            const suite = item.message.suites[suiteName];
            var value = {
                name: suiteName,
                startTime: suite.startTime,
                endTime: suite.endTime,
                total: 0,
                failed: 0,
                skipped: 0,
                succeed: 0
            };
            
            if(typeof suite.runners === 'object') {
                const runners = Object.values(suite.runners);
                value.total = runners.map(runner => runner.total).reduce((a, b) => a + b);
                value.failed = runners.map(runner => runner.failed).reduce((a, b) => a + b);
                value.skipped = runners.map(runner => runner.skipped).reduce((a, b) => a + b);
                value.succeed = runners.map(runner => runner.succeed).reduce((a, b) => a + b);
            }
            return value;
        });
        
        let data = {
            id: item.objectId,
            type: item.type,
            env: item.env,
            lastUpdate: item['@timestamp'],
            startTime: item.message.startTime,
            endTime: item.message.endTime,
            serverVersion: item.message.serverVersion,
            clientVersion: item.message.clientVersion,
            containerId: item.message.containerId,
            suites: suites,
            total: 0,
            failed: 0,
            skipped: 0,
            succeed: 0
        };

        if(item.type == 'ps') {
            data.report = `http://difido.irs1.ott.kaltura.com:8090/reports/exec_${item.objectId}/index.html`;
        } 
        else if(fs.existsSync(__dirname + '/../public/reports/' + item.objectId)) {
            data.report = `/reports/${item.objectId}/report/index.html`;
        }

        if(suites.length) {
            data.total = suites.map(suite => suite.total).reduce((a, b) => a + b);
            data.failed = suites.map(suite => suite.failed).reduce((a, b) => a + b);
            data.skipped = suites.map(suite => suite.skipped).reduce((a, b) => a + b);
            data.succeed = suites.map(suite => suite.succeed).reduce((a, b) => a + b);
        }

        return data;
    },

    jobsIntervals: {},
    deployIntervals: {},

    watchJob: (job) => {
        dataMapper.jobsIntervals[job.jobName] = true;
        setTimeout(() => search.updateJobStatus(job), 3000);
    },

    unwatchJob: (jobName, reason) => {
        delete dataMapper.jobsIntervals[jobName];
    },

    watchDeploy: (job) => {
        dataMapper.deployIntervals[`${job.jobName}-${job.lastBuild}`] = true;
        setTimeout(() => search.updateDeployStatus(job), 3000);
    },

    unwatchDeploy: (jobName, buildNumber, reason) => {
        delete dataMapper.deployIntervals[`${jobName}-${buildNumber}`];
    },

    jobData: (job, build) => {
        var duration = new Date().getTime() - build.timestamp;
        return {
            jobName: job.jobName,
            lastBuild: build.number,
            status: build.building ? 'STARTED' : build.result,
            '@timestamp': build.timestamp / 1000,
            duration: duration,
            estimatedLeft: build.estimatedDuration - duration,
            percentage: Math.floor(duration * 100 / build.estimatedDuration),
        };
    },

    job: (item) => {
        if(item.status == 'STARTED') {
            if(!dataMapper.jobsIntervals[item.jobName]) {
                search.logger.log(`Watching job ${item.jobName} build ${item.lastBuild}`);
                dataMapper.watchJob(item);
            }
        }
        else if(dataMapper.jobsIntervals[item.jobName]) {
            dataMapper.unwatchJob(item.jobName);
        }
        item.url = `${search.config.jenkinsReadUrl}/job/${item.jobName}/${item.lastBuild}/console`
        return item;
    },

    deploy: (item) => {
        if(item.status == 'STARTED') {
            if(!dataMapper.deployIntervals[`${item.jobName}-${item.lastBuild}`]) {
                search.logger.log(`Watching job ${item.jobName} build ${item.lastBuild}`);                
                dataMapper.watchDeploy(item);
            }
        }
        else if(dataMapper.deployIntervals[`${item.jobName}-${item.lastBuild}`]) {
            dataMapper.unwatchDeploy(item.jobName, item.lastBuild);
        }
        item.url = `${search.config.jenkinsReadUrl}/job/${item.jobName}/${item.lastBuild}/console`
        return item;
    },
};

const dataHandler = {
    'status-image': () => {},

    'status-container': (item) => {
        search.io.to(item.env).emit('container', dataMapper.container(item));
    },

    'status-node': (item) => {
        search.io.to(item.env).emit('service', item);
    },

    'status-service': (item) => {            
        search.io.to(item.env).emit('service', dataMapper.service(item));
    },

    'tests': (item) => {
        search.io.to(item.env).emit('test', dataMapper.test(item));
    },

    'jobs': (item) => {
        search.io.sockets.emit('job', dataMapper.job(item));
    },

    'deploy': (item) => {
        search.io.sockets.emit('deploy', dataMapper.job(item));
    },
};


const search = {
    init: (modules) => {
        search.config = modules.config;
        search.logger = modules.logger;
        search.jenkins = modules.jenkins;
    },

    start: (io) => {
        search.io =io;
        search.connect();
        
        search.elasticSearchClient = new elasticSearch.Client({
            host: search.config.elasticSearchApi,
            log: 'info'
        });
    },

    connect: () => {
        search.elasticSearchSocket = new ws(`ws://${search.config.elasticSearchWebSocket}`, {
            perMessageDeflate: false
        });
        search.elasticSearchSocket.on('message', search.onNewData);
        
        search.elasticSearchSocket.on('error', function open(err) {
            search.logger.log('Elastic-Search web-socket error: ' + err);
        });
        
        search.elasticSearchSocket.on('open', function open() {
            search.logger.log('Elastic-Search web-socket connected');
        });
        
        search.elasticSearchSocket.on('close', function close() {
            search.logger.log('Elastic-Search web-socket disconnected');
            setTimeout(search.connect, 1000);
        });
    },

    updateDeployStatus: (job) => {
        search.jenkins.getJobStatus(job.jobName, job.lastBuild)
        .then(
            data => {
                if(dataMapper.deployIntervals[`${job.jobName}-${job.lastBuild}`]) {
                    if(!data.building && data.result) {
                        dataMapper.unwatchDeploy(job.jobName, job.lastBuild, `build results ${data.result}`);
                    }
                    else {
                        dataMapper.watchDeploy(job);
                    }
                }
                search.io.sockets.emit('deployBuild', dataMapper.jobData(job, data));
                search.updateDeploy(job.id, data.result);
            },
            err => dataMapper.unwatchDeploy(job.jobName, job.lastBuild, `jenkins API error: ${err}`));
    },

    updateDeploy: (id, status) => {
        search.elasticSearchClient.update({
            index: 'deploy',
            type: '_doc',
            id: id,
            body: {
                doc: {
                    status: status
                }
            }
        })
        .catch(err => {
            search.logger.error(err.message);
        });
    },

    updateJobStatus: (job) => {
        search.jenkins.getJobStatus(job.jobName, job.lastBuild)
        .then(
            data => {
                if(dataMapper.jobsIntervals[job.jobName]) {
                    if(!data.building && data.result) {
                        dataMapper.unwatchJob(job.jobName);
                    }
                    else {
                        dataMapper.watchJob(job);
                    }
                }
                search.io.sockets.emit('jobBuild', dataMapper.jobData(job, data));
            },
            err => dataMapper.unwatchJob(job.jobName, `jenkins API error: ${err}`));
    },

    onNewData: (message) => {
        const data = JSON.parse(message);
        let handler = data._index;
        if(handler.match(/^tests-/)) {
            handler = 'tests';
        }
        else if(!dataHandler[handler]) {            
            search.logger.log('Missing data handler: ' + handler);
            return;
        }

        switch(data._operation) {
            case 'CREATE':
            case 'INDEX':
                var method = dataHandler[handler];
                method(data._source);
                break;
                
            case 'DELETE':
                var objectType = handler.replace(/^status-/, '').replace(/-core$/, '');
                search.io.sockets.emit('delete', objectType, data._id);
                break;
                
            default:
                search.logger.log('Unkown operation: ', data);
                process.exit();
        }
    },

    jobs: () => {
        return search.elasticSearchClient.search({
            index: 'jobs',
            size: 1000
        })
        .then(data => Promise.resolve(data.hits.hits.map(hit => hit._source)))
        .then(data => Promise.resolve(data.map(item => dataMapper.job(item))));
    },
    
    deployments: (env) => {
        return search.elasticSearchClient.search({
            index: 'deploy',
            size: 1000,
            body: {
                query: {
                    term: {
                        env: env
                    }
                }
            }
        })
        .then(data => Promise.resolve(data.hits.hits.map(hit => hit._source)))
        .then(data => Promise.resolve(data.map(item => dataMapper.deploy(item))));
    },
    
    tests: (env) => {
        return search.elasticSearchClient.search({
            index: 'tests-*',
            size: 1000,
            body: {
                sort : [{
                    '@timestamp': {
                        order: 'asc'
                    }
                }],
                query: {
                    term: {
                        env: env
                    }
                }
            }
        })
        // .then(data => Promise.resolve(data.hits.hits.map(hit => hit._source)))
        .then(filterVeryOldResults)
        .then(data => Promise.resolve(data.map(item => dataMapper.test(item))));
    },

    containers: (env) => {
        return search.elasticSearchClient.search({
            index: 'status-container',
            size: 1000,
            body: {
                query: {
                    term: {
                        env: env
                    }
                }
            }
        })
        .then(filterOldResults)
        .then(data => Promise.resolve(data.map(item => dataMapper.container(item))));
    },

    services: (env) => {
        return search.elasticSearchClient.search({
            index: 'status-service',
            size: 1000,
            body: {
                query: {
                    term: {
                        env: env
                    }
                }
            }
        })
        .then(filterOldResults)
        .then(data => Promise.resolve(data.map(item => dataMapper.service(item))));
    },

    nodes: (env) => {
        return search.elasticSearchClient.search({
            index: 'status-node',
            size: 1000,
            body: {
                query: {
                    term: {
                        env: env
                    }
                }
            }
        })
        .then(filterOldResults);
    },
}



const tenMinutesAgo = 10 * 60 * 1000;
const weekAgo = 7 * 24 * 60 * 60 * 1000;
function filterVeryOldResults(data) {
    return filterOldResults(data, weekAgo);
}
    
function filterOldResults(data, howOld) {
    if(!howOld) {
        howOld = tenMinutesAgo;
    }
    var now = new Date().getTime();
    var hits = data.hits.hits
    .filter(hit => {
        var timestamp = new Date(hit._source['@timestamp']).getTime();
        var diff = now - timestamp;
        if(diff > howOld) {
            search.logger.log(`Deleting old doc [${hit._id}]`)
            search.elasticSearchClient.delete({
                index: hit._index,
                type: hit._type,
                id: hit._id
            })
            .catch(err => {
                search.logger.error(err.message);
            });
            return false;
        }
        return true;
    })
    .map(hit => hit._source);

    return Promise.resolve(hits);
}



module.exports = (modules) => {
    search.init(modules)
    return search;
};

