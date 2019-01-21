
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const jenkinsApi = require('jenkins-api');
const elasticSearch = require('elasticsearch');

const config = JSON.parse(fs.readFileSync('config/config.json'));

const elasticSearchClient = new elasticSearch.Client({
    host: config.elasticSearchUrl,
    log: 'info'
});

const flowData = JSON.parse(fs.readFileSync('config/flow.json', 'utf8'));

const privateKey = fs.readFileSync('ssl-dev/key.pem', 'utf8');
const certificate = fs.readFileSync('ssl-dev/certificate.pem', 'utf8');
const credentials = {key: privateKey, cert: certificate};

const app = express();
const port = process.env.PORT || 80;
const secPort = process.env.SEC_PORT;

const logger = console;

class ECR {
    constructor() {        
        const aws = require('aws-sdk');
        aws.config.loadFromPath('config/aws.json');
        this.client = new aws.ECR({ apiVersion: '2015-09-21' });
        this.repositoriesNames = [];
        this.status = {};
    }

    start () {        
        var This = this;
        this.client.describeRepositories((err, data) => {
            if (err) {
                logger.error('Describe repositories:', err);
            }
            else {
                This.repositoriesNames = data.repositories.map(repo => repo.repositoryName);
                This.repositoriesNames.forEach(repositoryName => This.status[repositoryName] = {});
                setInterval(() => {
                    This.updateStatus();
                }, 10000);
            }
        });
    }

    updateStatus () {
        var regex = /^sha256:(.+)$/;
        var This = this;
        this.repositoriesNames.forEach(repositoryName => {
            This.client.describeImages({
                repositoryName: repositoryName,
                filter: { tagStatus: 'TAGGED' }
            }, (err, data) => {
                if (err) {
                    logger.error('Describe images:', err);
                }
                else {
                    data.imageDetails.forEach(image => {
                        var version = image.imageTags.find(tag => tag.match(/^[vV]?\d+[._]\d+[._]\d+([._]\d+)?$/));
                        if(version) {
                            version = version
                                .replace(/^[vV]/, '')
                                .replace(/_/g, '.');
                        }

                        image.imageTags.forEach(tag => {
                            var matches = regex.exec(image.imageDigest);                
                            var digest = null;
                            if(matches) {
                                digest = matches[1];
                            }
                            This.status[image.repositoryName][tag] = {
                                tags: image.imageTags,
                                version: version,
                                digest: digest,
                                pushedAt: image.imagePushedAt,
                            }
                        });
                    });
                }
            });
        });
    }
}
const ecr = new ECR();
ecr.start();

const jenkins = {
    client: jenkinsApi.init(config.jenkinsUrl),
    jobs: {},

    getBuild: (jobName, buildNumber, callback) => {    
        jenkins.client.build_info(jobName, buildNumber, (err, buildData) => {
            if (err) {
                logger.error(`Update job [${jobName}] build [${buildNumber}]:`, err.message);
            }
            else {
                callback(buildData);
            }
        });
    },
        
    updateJob: (jobName, getAllBuilds) => {   
        jenkins.client.job_info(jobName, (err, jobData) => {
            if (err) {
                logger.error('Update job:', err.message);
                if(!jenkins.jobs[jobName]) {
                    jenkins.jobs[jobName] = {
                        color: "nobuilt"
                    }
                }
            }
            else {
                if(!jenkins.jobs[jobName]) {
                    jenkins.jobs[jobName] = {
                        description: jobData.description
                    };
                }
                jenkins.jobs[jobName].inQueue = jobData.inQueue;
                jenkins.jobs[jobName].color = jobData.color;

                if(getAllBuilds) {
                    if(!jenkins.jobs[jobName].builds) {
                        jenkins.jobs[jobName].builds = {};
                    }

                    jobData.builds.forEach(build => jenkins.getBuild(jobName, build.number, buildData => {
                        var parameters = buildData
                            .actions
                            .reduce((action1, action2) => action1.parameters ? action1 : action2)
                            .parameters
                            .reduce((result, item, index) => {
                                result[item.name] = item.value;
                                return result;
                              }, {});

                        jenkins.jobs[jobName].builds[build.number] = {
                            url: buildData.url,
                            timestamp: buildData.timestamp,
                            duration: buildData.duration,
                            building: buildData.building,
                            result: buildData.result,
                            parameters: parameters
                        };
                    }));
                }
                else {
                    jenkins.getBuild(jobName, jobData.lastBuild.number, buildData => {
                        jenkins.jobs[jobName].lastBuild = {
                            url: buildData.url,
                            building: buildData.building,
                            timestamp: buildData.timestamp,
                            duration: buildData.duration,
                            result: buildData.result
                        };
                        var duration = new Date().getTime() - buildData.timestamp;
                        if(buildData.building) {
                            jenkins.jobs[jobName].lastBuild.duration = duration;
                            jenkins.jobs[jobName].lastBuild.estimatedLeft = buildData.estimatedDuration - duration;
                            jenkins.jobs[jobName].lastBuild.percentage = Math.floor(duration * 100 / buildData.estimatedDuration);
                        }
                    });
                }
            }
        });
    },

    updateJobsData: (frames) => {
        frames.forEach(frame => {
            if(frame.type == "jenkins") {
                jenkins.updateJob(frame.name);
            }
            if(frame.items) {
                jenkins.updateJobsData(frame.items);
            }
        });
    },

    updateJobs: () => {
        jenkins.updateJobsData(flowData);

        jenkins.updateJob('Tag-Docker', true);
        jenkins.updateJob('Tag-Docker-Linux', true);
        jenkins.updateJob('Tag-Docker-Windows', true);
    },

    build: (jobName, parameters) => {
        return new Promise((resolve, reject) => {   
            if(!parameters) {
                parameters = {};
            }
            jenkins.client.build_with_params(jobName, parameters, (err, data) => {
                if (err) {
                    reject(err);
                }
                else {
                    if(data.statusCode === 201) {
                        resolve(true);
                    }
                    else {
                        reject(data.body);
                    }
                }
            });
        });
    }
}
setInterval(jenkins.updateJobs, 10000);

const halfAnHour = 10 * 60 * 1000;
function filterOldResults(data) {
    var now = new Date().getTime();
    var hits = data.hits.hits
    .filter(hit => {
        var timestamp = new Date(hit._source['@timestamp']).getTime();
        var diff = now - timestamp;
        if(diff > halfAnHour) {
            console.log(`Deleting old doc [${hit._id}]`)
            elasticSearchClient.delete({
                index: hit._index,
                type: hit._type,
                id: hit._id
            })
            .catch(err => {
                console.error(err.message);
            });
            return false;
        }
        return true;
    })
    .map(hit => hit._source);

    return Promise.resolve(hits);
}

const api = {

    handle: (res, action, data) => {
        if(api[action]) {
            let method = api[action];
            method(data)
            .then(
                response => res.send(response), 
                err => {
                    logger.error(`API [${action}] failed:`, err);
                    res.status(500).send(err);
                }
            );
        }
        else {
            logger.error(`API action [${action}] not found`);
            res.status(404).send(`API action ${action} not found`)
        }
    },

    build: ({job, parameters}) => {
        return jenkins.build(job, parameters);
    },

    flow: () => {
        return Promise.resolve(flowData);
    },

    ecr: () => {
        return Promise.resolve(ecr.status);
    },

    jobs: () => {
        return Promise.resolve(jenkins.jobs);
    },

    containers: () => {
        return elasticSearchClient.search({
            index: 'status-container',
            size: 1000
        })
        .then(filterOldResults);
    },

    services: () => {
        return elasticSearchClient.search({
            index: 'status-service',
            size: 1000
        })
        .then(filterOldResults);
    },

    nodes: () => {
        return elasticSearchClient.search({
            index: 'status-node',
            size: 1000
        })
        .then(filterOldResults);
    }
}

process.on('uncaughtException', err => {
    logger.error('Uncaught Exception: ' + err.stack);
});

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.use(express.static(path.join(__dirname, '/public')));

app.get('/api/*', (req, res) => {
    let parts = req.path.split('/');
    let action = parts[2];
    api.handle(res, action);
});

app.use(express.json());
  
app.post('/api/*', (req, res) => {
    let parts = req.path.split('/');
    let action = parts[2];
    api.handle(res, action, req.body);
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