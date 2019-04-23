const fs = require('fs');
const aws = require('aws-sdk');

class EnvDeploy {
    constructor(env) {
        let config = JSON.parse(fs.readFileSync(`config/aws/${env}.json`));

        this.env = env;
        this.s3 = new aws.S3(config);
        this.elb = new aws.ELBv2(config);
        this.autoscaling = new aws.AutoScaling(config);
    }
    
    masterStarted() {
        var This = this;
        return new Promise((resolve, reject) => {
            var run = () => {
                This.autoscaling.describeAutoScalingGroups({AutoScalingGroupNames: ['swarm-' + This.env + '-manager-linux']}, (err, data) => {
                    if(err) {
                        return reject(err);
                    }
                    if(data.AutoScalingGroups && data.AutoScalingGroups.length) {
                        var autoScalingGroup = data.AutoScalingGroups.pop();
                        if(autoScalingGroup.Instances && autoScalingGroup.Instances.length) {
                            deploy.logger.log('Master ' + This.env + ' instance started');
                            return resolve();
                        }
                    }
                    deploy.logger.log('Master ' + This.env + ' not started yet');
                    setTimeout(run, 10000);
                });
            };
            run();
        });
    }
    
    clusterStarted() {
        var This = this;
        return new Promise((resolve, reject) => {
            var run = () => {
                This.s3.getObject({Bucket: 'swarm-' + This.env + '-cluster', Key: 'manager-token'}, (err, data) => {
                    if(err && err.code != 'NoSuchKey') {
                        return reject(err);
                    }
                    else if(data) {
                        deploy.logger.log('Cluster ' + This.env + ' started');
                        return resolve();
                    }
                    deploy.logger.log('Cluster ' + This.env + ' not started yet');
                    return setTimeout(run, 10000);
                });
            };
            run();
        });
    }
    
    clusterReady() {
        var This = this;
        return new Promise((resolve, reject) => {
            This.elb.describeTargetGroups({Names: ['swarm-' + This.env + '-cluster']}, (err, data) => {
                if(err) {
                    return reject(err);
                }
                if(!data.TargetGroups || !data.TargetGroups.length) {
                    return reject('Target group not found');
                }
                var groupArn = data.TargetGroups.pop().TargetGroupArn;
                var run = () => {
                    This.elb.describeTargetHealth({TargetGroupArn: groupArn}, (err, data) => {
                        if(err) {
                            return reject(err);
                        }
                        if(data.TargetHealthDescriptions && data.TargetHealthDescriptions.some(target => target.TargetHealth.State == 'healthy')) {
                            deploy.logger.log('Cluster ' + This.env + ' Load-Balancer is ready');
                            return resolve();
                        }
                        deploy.logger.log('Cluster ' + This.env + ' Load-Balancer is not ready yet');
                        return setTimeout(run, 10000);
                    });
                };
                run();
            });
        });
    }
    
    startNodes() {
        var This = this;
        This.autoscaling.describeAutoScalingGroups({}, (err, data) => {
            if(err) {
                return reject(err);
            }
            var capacities = data
                .AutoScalingGroups
                .filter(asg => asg.AutoScalingGroupName.startsWith('swarm-' + This.env + '-'))
                .map(asg => asg.Tags.filter(tag => (tag.Key == 'Init.Capacity' && tag.Value > 0)))
                .filter(arr => arr.length)
                .map(arr => arr.pop());
    
            capacities.forEach(({ResourceId, Value}) => {
                deploy.logger.log(ResourceId, Value);
                This.autoscaling.setDesiredCapacity({AutoScalingGroupName: ResourceId, DesiredCapacity: Value}, (err) => {
                    if(err) {
                        deploy.logger.error(err);
                    }
                });
            });
        });
    }
    
}
const deploy = {
    init: (modules) => {
        deploy.config = modules.config;
        deploy.logger = modules.logger;
        deploy.jenkins = modules.jenkins;
    },

    deploy: (src, env) => {
        let envDeploy = new EnvDeploy(env);
        envDeploy.masterStarted()
            .then(() => envDeploy.clusterStarted())
            .then(() => envDeploy.clusterReady())
            .then(() => envDeploy.startNodes());

        return new Promise((resolve, reject) => {
            var requiredRepos = [
                {from_image: `${src}-version-deploy:linux-latest`, to_image: `${env}-version-deploy:linux-latest`},
                {from_image: `${src}-tcm-configure:latest`, to_image: `${env}-tcm-configure:latest`},
            ];
            Promise
                .all(requiredRepos.map(params => deploy.jenkins.deploy('Push-Docker-Linux', src, env, params)))
                .then(() => resolve());
                
            var windowsRepos = [
                {from_image: `${src}-version-deploy:windows-latest`, to_image: `${env}-version-deploy:windows-latest`},
                {from_image: `${src}-version-updater:windows-latest`, to_image: `${env}-version-updater:windows-latest`},
                {from_image: `${src}-ecr-login:windows-latest`, to_image: `${env}-ecr-login:windows-latest`},
                {from_image: `${src}-filebeat:latest`, to_image: `${env}-filebeat:latest`},
                {from_image: `${src}-phoenix:latest`, to_image: `${env}-phoenix:latest`},
                {from_image: `${src}-ingest:latest`, to_image: `${env}-ingest:latest`},
                {from_image: `${src}-web-services:latest`, to_image: `${env}-web-services:latest`},
                {from_image: `${src}-tvp-api:latest`, to_image: `${env}-tvp-api:latest`},
            ];
            windowsRepos.map(params => deploy.jenkins.deploy('Push-Docker-Windows', src, env, params));

            var linuxRepos = [
                {from_image: `${src}-version-updater:linux-latest`, to_image: `${env}-version-updater:linux-latest`},
                {from_image: `${src}-logstash:latest`, to_image: `${env}-logstash:latest`},
                {from_image: `${src}-ecr-login:linux-latest`, to_image: `${env}-ecr-login:linux-latest`},
                {from_image: `${src}-tcm:latest`, to_image: `${env}-tcm:latest`},
                {from_image: `${src}-gateway:latest`, to_image: `${env}-gateway:latest`},
                {from_image: `${src}-opc:latest`, to_image: `${env}-opc:latest`},
                {from_image: `${src}-ttv-engine:latest`, to_image: `${env}-ttv-engine:latest`},
                {from_image: `${src}-phoenix-doc:latest`, to_image: `${env}-phoenix-doc:latest`},
                {from_image: `${src}-tcm-ui:latest`, to_image: `${env}-tcm-ui:latest`},
                {from_image: `${src}-reports-uploader:latest`, to_image: `${env}-reports-uploader:latest`},
                {from_image: `${src}-backend-tests:latest`, to_image: `${env}-backend-tests:latest`},
                {from_image: `${src}-elastic-cleaner:latest`, to_image: `${env}-elastic-cleaner:latest`},
            ];
            linuxRepos.map(params => deploy.jenkins.deploy('Push-Docker-Linux', src, env, params));
        });
    }
}

module.exports = (modules) => {
    deploy.init(modules)
    return deploy;
};