const fs = require('fs');
const aws = require('aws-sdk');

class EnvDeploy {
    constructor(env, src) {
        let config = JSON.parse(fs.readFileSync(`config/aws/${env}.json`));

        this.env = env;
        this.src = src;
        this.s3 = new aws.S3(config);
        this.ecr = new aws.ECR(config);
        this.elb = new aws.ELBv2(config);
        this.autoscaling = new aws.AutoScaling(config);

        this.items = [
            this.reposPushed,
            this.masterStarted,
            this.clusterStarted,
            this.clusterReady,
            this.linuxManagersStarted,
            this.nodesStarted,
            this.portainerAvailable,
            this.tcmAvailable,
            this.gatewayAvailable,
            this.docsAvailable,
            this.opcAvailable,
            this.apiAvailable,
        ];
    }

    report(type, status, msg) {
        deploy.logger.log(`Env ${this.env} [${type}]: ${msg}`);
        deploy.io.emit('status', this.env, type, status, msg);
    }

    run(deploy) {
        var This = this;
        var step = this.items.shift();
        var firstRun = deploy;

        This.report('start');
        return new Promise((resolve) => {
            var stepInto = () => {
                step.apply(This, [firstRun]).then(({type, msg}) => {
                    firstRun = deploy;
                    This.report(type, true, msg);
                    if(this.items.length) {
                        step = This.items.shift();
                        setTimeout(stepInto, 0);
                    }
                    else {
                        resolve();
                    }
                }, ({type, msg}) => {
                    firstRun = false;
                    This.report(type, false, msg);
                    setTimeout(stepInto, 10000);
                });
            };
            stepInto();
        });
    }
    
    targetGroupReady(type, targetGroup) {
        var This = this;
        return new Promise((resolve, reject) => {
            This.elb.describeTargetGroups({Names: [targetGroup]}, (err, data) => {
                if(err) {
                    return reject({type: type, msg: 'Listener not found'});
                }
                if(!data.TargetGroups || !data.TargetGroups.length) {
                    return reject({type: type, msg: 'Target group not found'});
                }
                var groupArn = data.TargetGroups.pop().TargetGroupArn;
                This.elb.describeTargetHealth({TargetGroupArn: groupArn}, (err, data) => {
                    if(err) {
                        return reject({type: type, msg: 'Listener health status not found'});
                    }
                    if(data.TargetHealthDescriptions && data.TargetHealthDescriptions.some(target => target.TargetHealth.State == 'healthy')) {
                        return resolve({type: type, msg: 'Ready'});
                    }
                    reject({type: type, msg: 'Not ready yet'});
                });
            });
        });
    }

    reposPushed(firstRun) {
        var This = this;
        if(!This.src || !This.src.length) {
            return Promise.resolve({type: 'repos', msg: 'No images required'});
        }

        var requiredRepos = [
            {name: 'version-deploy', tag: 'linux-latest'},
            // {name: 'consul', tag: 'latest'}, // TODO 
            {name: 'tcm-configure', tag: 'latest'}
        ];
        
        var windowsRepos = [
            {name: 'version-deploy', tag: 'windows-latest'},
            {name: 'version-updater', tag: 'windows-latest'},
            {name: 'ecr-login', tag: 'windows-latest'},
            {name: 'filebeat', tag: 'latest'},
            {name: 'phoenix', tag: 'latest'},
            {name: 'ingest', tag: 'latest'},
            {name: 'web-services', tag: 'latest'},
            {name: 'tvp-api', tag: 'latest'},
        ];

        var linuxRepos = [
            {name: 'version-updater', tag: 'linux-latest'},
            {name: 'logstash', tag: 'latest'},
            {name: 'ecr-login', tag: 'linux-latest'},
            {name: 'tcm', tag: 'latest'},
            {name: 'gateway', tag: 'latest'},
            {name: 'opc', tag: 'latest'},
            {name: 'ttv-engine', tag: 'latest'},
            {name: 'phoenix-doc', tag: 'latest'},
            {name: 'tcm-ui', tag: 'latest'},
            {name: 'reports-uploader', tag: 'latest'},
            {name: 'backend-tests', tag: 'latest'},
            {name: 'elastic-cleaner', tag: 'latest'},
        ];

        var promises = requiredRepos.map(repo => {
            return new Promise((resolve, reject) => {
                This.ecr.describeImages({
                    repositoryName: `${This.env}-${repo.name}`,
                    filter: { tagStatus: 'TAGGED' }
                }, (err, data) => {
                    console.log(err, data);
                    if(!err && data.imageDetails.some(image => image.imageTags.some(tag => tag === repo.tag))) {
                        resolve();
                    }
                    else {
                        reject();
                    }
                });
            });
        });
        
        var push = () => {
            var repoToParams = repo => {
                return {
                    from_image: `${This.src}-${repo.name}:${repo.tag}`, to_image: `${This.env}-${repo.name}:${repo.tag}`}
            };

            requiredRepos
            .map(repoToParams)
            .map(params => deploy.jenkins.deploy('Push-Docker-Linux', This.src, This.env, params));
            
            windowsRepos
            .map(repoToParams)
            .map(params => deploy.jenkins.deploy('Push-Docker-Windows', src, env, params));

            linuxRepos
            .map(repoToParams)
            .map(params => deploy.jenkins.deploy('Push-Docker-Linux', src, env, params));
        };

        return new Promise((resolve, reject) => {            
            Promise
                .all(promises)
                .then(() => resolve({type: 'repos', msg: 'Required images deployed'}), (missing) => {
                    console.log('missing', missing);
                    if(firstRun) {
                        push();
                    }
                    var done = promises.length - (Array.isArray(missing) ? missing.length : promises.length);
                    reject({type: 'repos', msg: `Required images are not deployed yet (${done}/${promises.length})`});
                });
        });
    }

    masterStarted(firstRun) {
        var This = this;
        return new Promise((resolve, reject) => {
            This.autoscaling.describeAutoScalingGroups({AutoScalingGroupNames: ['swarm-' + This.env + '-manager-linux']}, (err, data) => {
                if(err) {
                    return reject({type: 'master', msg: 'Auto-Scailing-Group not found'});
                }
                if(data.AutoScalingGroups && data.AutoScalingGroups.length) {
                    var autoScalingGroup = data.AutoScalingGroups.pop();
                    if(autoScalingGroup.Instances && autoScalingGroup.Instances.length) {
                        return resolve({type: 'master', msg: 'Started'});
                    }
                }
                reject({type: 'master', msg: 'Not started yet'});
            });
        });
    }
    
    clusterStarted() {
        var This = this;
        return new Promise((resolve, reject) => {
            This.s3.getObject({Bucket: 'swarm-' + This.env + '-cluster', Key: 'manager-token'}, (err, data) => {
                if(err && err.code != 'NoSuchKey') {
                    return reject({type: 'cluster', msg: 'Tokens not found'});
                }
                else if(data) {
                    return resolve({type: 'cluster', msg: 'Started'});
                }
                reject({type: 'cluster', msg: 'Not started yet'});
            });
        });
    }
    
    clusterReady() {
        return this.targetGroupReady('mng-load-balancer', 'swarm-' + this.env + '-cluster');
    }
            
    linuxManagersStarted() {
        var This = this;
        return new Promise((resolve, reject) => {
            This.autoscaling.describeAutoScalingGroups({AutoScalingGroupNames: ['swarm-' + This.env + '-manager-linux']}, (err, data) => {
                if(err) {
                    return reject({type: 'managers', msg: 'Auto-Scailing-Group not found'});
                }
                var autoScalingGroup = data.AutoScalingGroups.pop();
                var plannedCapacity = autoScalingGroup
                    .Tags
                    .filter(tag => (tag.Key == 'Init.Capacity'))
                    .pop()
                    .Value;

                if(plannedCapacity > autoScalingGroup.DesiredCapacity) {
                    return This.autoscaling.setDesiredCapacity({AutoScalingGroupName: 'swarm-' + This.env + '-manager-linux', DesiredCapacity: plannedCapacity}, (err, data) => {
                        if(err) {
                            return reject({type: 'managers', msg: 'Failed to scale up'});
                        }
                        reject({type: 'managers', msg: 'Scaled up to ' + plannedCapacity});
                    });
                }
                else if(autoScalingGroup.Instances.length < plannedCapacity) {
                    return reject({type: 'managers', msg: 'Running (' + autoScalingGroup.Instances.length + '/' + plannedCapacity + ')'});
                }
        
                resolve({type: 'managers', msg: 'Ready (' + plannedCapacity + '/' + plannedCapacity + ')'});
            });
        });
    }

    nodesStarted() {
        var This = this;
        return new Promise((resolve, reject) => {
            This.autoscaling.describeAutoScalingGroups({}, (err, data) => {
                if(err) {
                    return reject({type: 'nodes', msg: 'Failed to load auto-scailing-groups'});
                }
                var autoScalingGroups = data.AutoScalingGroups
                    .filter(asg => asg.AutoScalingGroupName.startsWith('swarm-' + This.env + '-'))
        
                var scaleUp = false;
                var plannedInstances = 0;
                var runningInstances = 0;
                for(var i = 0; i < autoScalingGroups.length; i++) {
                    var asg = autoScalingGroups[i];
                    var plannedCapacity = asg.Tags.filter(tag => (tag.Key == 'Init.Capacity')).pop().Value;
                    if(plannedCapacity) {
                        plannedInstances += (plannedCapacity * 1);
                        runningInstances += asg.Instances.length;
                        if(plannedCapacity > asg.DesiredCapacity) {
                            scaleUp = true;
                            This.autoscaling.setDesiredCapacity({AutoScalingGroupName: asg.AutoScalingGroupName, DesiredCapacity: plannedCapacity}, (err) => {
                                if(err) {
                                    deploy.logger.error(err);
                                }
                            });
                        }
                        else if(asg.Instances.length < plannedCapacity) {
                            deploy.logger.log(asg.AutoScalingGroupName + ' - missing instances (' + asg.Instances.length + '/' + plannedCapacity + ')');
                            missingInstances = true;
                        }
                    }
                }
                if(scaleUp) {
                    return reject({type: 'nodes', msg: 'Scaled up auto-scailing-groups'});
                }
                if(plannedInstances > runningInstances) {
                    return reject({type: 'nodes', msg: 'Waiting for instances to start (' + plannedInstances + '/' + runningInstances + ')'});
                }
                resolve({type: 'nodes', msg: 'Ready (' + plannedInstances + '/' + runningInstances + ')'});
            });
        });
    }
    
    portainerAvailable() {
        return this.targetGroupReady('portainer', 'swarm-' + this.env + '-portainer');
    }

    tcmAvailable() {
        return this.targetGroupReady('tcm', 'swarm-' + this.env + '-tcm');
    }

    gatewayAvailable() {
        return this.targetGroupReady('gateway', 'swarm-' + this.env + '-gateway');
    }

    docsAvailable() {
        return this.targetGroupReady('docs', 'swarm-' + this.env + '-phoenix-doc');
    }

    opcAvailable() {
        return this.targetGroupReady('opc', 'swarm-' + this.env + '-opc');
    }

    apiAvailable() {
        return this.targetGroupReady('api', 'swarm-' + This.env + '-phoenix');
    }
}

const deploy = {
    init: (modules) => {
        deploy.config = modules.config;
        deploy.logger = modules.logger;
        deploy.jenkins = modules.jenkins;
    },

    deploy: (src, env, deploy) => {
        let envDeploy = new EnvDeploy(env, src);
        envDeploy.run(deploy).then(() => {
            envDeploy = null;
        });
        return Promise.resolve();
    },

    start: (io) => { 
        deploy.io = io;
    }
}

module.exports = (modules) => {
    deploy.init(modules)
    return deploy;
};