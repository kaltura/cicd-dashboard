
const fs = require('fs');
const aws = require('aws-sdk');

const ecr = {
    regex: /^sha256:(.+)$/,

    init: (modules) => {
        ecr.modules = modules;
        ecr.logger = modules.logger;
        ecr.status = {};
    },

    start: (io) => { 
        ecr.io = io;
        ecr.envs = ecr.modules.api
        .getFlow('env')
        .filter(env => fs.existsSync(`config/aws/${env.tag}.json`))
        .map(env => {
            let config = JSON.parse(fs.readFileSync(`config/aws/${env.tag}.json`));
            config.apiVersion = '2015-09-21';
            let client = new aws.ECR(config);
            ecr.status[env.tag] = {};
            client.describeRepositories((err, data) => {
                if (err) {
                    ecr.logger.error('Describe repositories:', err);
                }
                else {
                    var repositoriesNames = data.repositories.map(repo => repo.repositoryName);
                    repositoriesNames.forEach(repositoryName => {
                        if(repositoryName.startsWith(env.tag + '-')) {
                            ecr.status[env.tag][repositoryName] = {};
                        }
                    });
                    ecr.updateEnv(client, env.tag);
                }
            });
                        
            return {
                tag: env.tag,
                client: client
            };
        });
        
        setInterval(() => {
            ecr.updateStatus();
        }, 10000);
    },

    isEqual: (a, b) => {
        return JSON.stringify(a) == JSON.stringify(b);
    },

    updateEnv: (client, envTag) => {
        Object.keys(ecr.status[envTag]).forEach(repositoryName => {
            client.describeImages({
                repositoryName: repositoryName,
                filter: { tagStatus: 'TAGGED' }
            }, (err, data) => {
                if (err) {
                    ecr.logger.error('Describe images:', err);
                }
                else {
                    data.imageDetails.forEach(image => {
                        var version = image.imageTags.find(tag => tag.match(/^([vV]|linux-|windows-)?\d+[.]\d+[.]\d+([.]\d+)?$/));
                        if(version) {
                            version = version
                                .replace(/^[vV]/, '')
                                .replace(/^linux-/, '')
                                .replace(/^windows-/, '');
                        }

                        image.imageTags.forEach(tag => {
                            var matches = ecr.regex.exec(image.imageDigest);                
                            var digest = null;
                            if(matches) {
                                digest = matches[1];
                            }
                            var tagData = {
                                tags: image.imageTags,
                                version: version,
                                digest: digest,
                                pushedAt: image.imagePushedAt,
                            };
                            if(ecr.status[envTag][repositoryName][tag]) {
                                if(ecr.isEqual(ecr.status[envTag][repositoryName][tag], tagData)) {
                                    return;
                                }
                            }
                            ecr.status[envTag][repositoryName][tag] = tagData;
                            ecr.io.to(envTag).emit('ecr', envTag, repositoryName, tagData);
                        });
                    });
                }
            });
        });
    },

    updateStatus: () => {
        ecr.envs.forEach(env => ecr.updateEnv(env.client, env.tag));
    },
}

module.exports = (modules) => {
    ecr.init(modules)
    return ecr;
};

