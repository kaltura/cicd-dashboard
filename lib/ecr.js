
const aws = require('aws-sdk');

const ecr = {
    init: (logger, config) => {        
        ecr.logger = logger;
        aws.config.loadFromPath('config/aws.json');
        ecr.client = new aws.ECR({ apiVersion: '2015-09-21' });
        ecr.repositoriesNames = [];
        ecr.status = {};
        ecr.start();
    },

    start: () => { 
        ecr.client.describeRepositories((err, data) => {
            if (err) {
                ecr.logger.error('Describe repositories:', err);
            }
            else {
                ecr.repositoriesNames = data.repositories.map(repo => repo.repositoryName);
                ecr.repositoriesNames.forEach(repositoryName => ecr.status[repositoryName] = {});
                setInterval(() => {
                    ecr.updateStatus();
                }, 10000);
            }
        });
    },

    updateStatus: () => {
        var regex = /^sha256:(.+)$/;
        ecr.repositoriesNames.forEach(repositoryName => {
            ecr.client.describeImages({
                repositoryName: repositoryName,
                filter: { tagStatus: 'TAGGED' }
            }, (err, data) => {
                if (err) {
                    ecr.logger.error('Describe images:', err);
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
                            ecr.status[image.repositoryName][tag] = {
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

module.exports = (logger, config) => {
    ecr.init(logger, config)
    return ecr;
};

