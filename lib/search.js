
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
            
            if(data.tag.match(/^linux-/)) {
                data.app += "-linux";
                data.tagPrefix = "linux";
            }
            if(data.tag.match(/^windows-/)) {
                data.app += "-windows";
                data.tagPrefix = "windows";
            }
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
                        
            if(data.tag.match(/^linux-/)) {
                data.app += "-linux";
                data.tagPrefix = "linux";
            }
            if(data.tag.match(/^windows-/)) {
                data.app += "-windows";
                data.tagPrefix = "windows";
            }
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

        let suites = !item.message.suites ? [] : Object.keys(item.message.suites).map(suiteName => {
            const suite = item.message.suites[suiteName];
            const runners = Object.values(suite.runners);
            return {
                name: suiteName,
                startTime: suite.startTime,
                endTime: suite.endTime,
                total: runners.map(runner => runner.total).reduce((a, b) => a + b),
                failed: runners.map(runner => runner.failed).reduce((a, b) => a + b),
                skiped: runners.map(runner => runner.skiped).reduce((a, b) => a + b),
                succeed: runners.map(runner => runner.succeed).reduce((a, b) => a + b)
            };
        });
        
        let data = {
            id: item.objectId,
            env: item.env,
            lastUpdate: item['@timestamp'],
            startTime: item.message.startTime,
            endTime: item.message.endTime,
            serverVersion: item.message.serverVersion,
            clientVersion: item.message.clientVersion,
            containerId: item.message.containerId,
            suites: suites,
            total: suites.map(suite => suite.total).reduce((a, b) => a + b),
            failed: suites.map(suite => suite.failed).reduce((a, b) => a + b),
            skiped: suites.map(suite => suite.skiped).reduce((a, b) => a + b),
            succeed: suites.map(suite => suite.succeed).reduce((a, b) => a + b)
        };

        return data;
    },

    jobsIntervals: {},
    deployIntervals: {},

    unwatchJob: (jobName, reason) => {
        if(dataMapper.jobsIntervals[jobName]) {
            search.logger.log(`Unwatching job ${jobName}, ${reason}`);
            clearInterval(dataMapper.jobsIntervals[jobName]);
            delete dataMapper.jobsIntervals[jobName];
        }
    },

    unwatchDeploy: (jobName, buildNumber, reason) => {
        if(dataMapper.deployIntervals[`${jobName}-${buildNumber}`]) {
            search.logger.log(`Unwatching deploy ${jobName}, ${reason}`);
            clearInterval(dataMapper.deployIntervals[`${jobName}-${buildNumber}`]);
            delete dataMapper.deployIntervals[`${jobName}-${buildNumber}`];
        }
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
                dataMapper.jobsIntervals[item.jobName] = setInterval(() => search.updateJobStatus(item), 2000);
            }
        }
        else if(dataMapper.jobsIntervals[item.jobName]) {
            dataMapper.unwatchJob(item.jobName, `job status ${item.status}`);
        }
        item.url = `${search.config.jenkinsReadUrl}/job/${item.jobName}/${item.lastBuild}/console`
        return item;
    },

    deploy: (item) => {
        if(item.status == 'STARTED') {
            if(!dataMapper.deployIntervals[`${item.jobName}-${item.lastBuild}`]) {
                search.logger.log(`Watching job ${item.jobName} build ${item.lastBuild}`);
                dataMapper.deployIntervals[`${item.jobName}-${item.lastBuild}`] = setInterval(() => search.updateDeployStatus(item), 2000);
            }
        }
        else if(dataMapper.deployIntervals[`${item.jobName}-${item.lastBuild}`]) {
            dataMapper.unwatchDeploy(item.jobName, item.lastBuild, `job status ${item.status}`);
        }
        item.url = `${search.config.jenkinsReadUrl}/job/${item.jobName}/${item.lastBuild}/console`
        return item;
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
        search.elasticSearchSocket = new ws(`ws://${search.config.elasticSearchWebSocket}`, {
            perMessageDeflate: false
        });
        search.elasticSearchSocket.on('message', search.onNewData);
        
        search.elasticSearchClient = new elasticSearch.Client({
            host: search.config.elasticSearchApi,
            log: 'info'
        });
    },

    updateDeployStatus: (job) => {
        search.jenkins.getJobStatus(job.jobName, job.lastBuild)
        .then(
            data => {
                if(!data.building && data.result && dataMapper.deployIntervals[`${job.jobName}-${job.lastBuild}`]) {
                    dataMapper.unwatchDeploy(job.jobName, job.lastBuild, `build results ${data.result}`);
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
                if(!data.building && data.result && dataMapper.jobsIntervals[job.jobName]) {
                    dataMapper.unwatchJob(job.jobName, `build results ${data.result}`);
                }
                search.io.sockets.emit('jobBuild', dataMapper.jobData(job, data));
            },
            err => dataMapper.unwatchJob(job.jobName, `jenkins API error: ${err}`));
    },

    onNewData: (message) => {
        const data = JSON.parse(message);
        if(!search.dataHandler[data._index]) {
            search.logger.log('Missing data handler: ' + data._index);
            return;
        }

        switch(data._operation) {
            case 'CREATE':
            case 'INDEX':
                const handler = search.dataHandler[data._index];
                handler(data._source);
                break;
                
            case 'DELETE':
                var objectType = data._index.replace(/^status-/, '').replace(/-core$/, '');
                search.io.sockets.emit('delete', objectType, data._id);
                break;
                
            default:
                search.logger.log('Unkown operation: ', data);
                process.exit();
        }
    },

    dataHandler: {
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

        'tests-core': (item) => {
            search.io.to(item.env).emit('test', dataMapper.test(item));
        },

        'jobs': (item) => {
            search.io.sockets.emit('job', dataMapper.job(item));
        },

        'deploy': (item) => {
            search.io.sockets.emit('deploy', dataMapper.job(item));
        },
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
            index: 'tests-core',
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
        // .then(filterOldResults) TODO tests cleanup
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



const halfAnHour = 10 * 60 * 1000;
function filterOldResults(data) {
    var now = new Date().getTime();
    var hits = data.hits.hits
    .filter(hit => {
        var timestamp = new Date(hit._source['@timestamp']).getTime();
        var diff = now - timestamp;
        if(diff > halfAnHour) {
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

