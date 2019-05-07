const fs = require('fs');
const jenkinsApi = require('jenkins-api');

const jenkins = {
    jobs: {},

    init: (modules) => {
        jenkins.logger = modules.logger;
        jenkins.client = jenkinsApi.init(modules.config.jenkinsUrl);
    },

    getBuild: (jobName, buildNumber, callback) => {    
        jenkins.client.build_info(jobName, buildNumber, (err, buildData) => {
            if (err) {
                // jenkins.logger.error(`Update job [${jobName}] build [${buildNumber}]:`, err.message);
            }
            else {
                callback(buildData);
            }
        });
    },
        
    getJobStatus: (jobName, buildNumber) => {
        return new Promise((resolve, reject) => {
            jenkins.client.build_info(jobName, buildNumber, (err, buildData) => {
                if (err) {
                    jenkins.logger.error(`Get job [${jobName}] build [${buildNumber}]:`, err.message);
                    reject(err.message);
                }
                else {
                    resolve(buildData);
                }
            });
        });
    },

    build: (jobName, parameters) => {
        return new Promise((resolve, reject) => {   
            if(!parameters) {
                parameters = {};
            }
            jenkins.client.build_with_params(jobName, parameters, (err, data) => {
                if (err) {
                    jenkins.logger.error(`Failed to build job [${jobName}]`, err, data);
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
    },

    deploy: (jobName, src, tag, parameters) => {
        let fromConfig = JSON.parse(fs.readFileSync(`config/aws/${src}.json`));
        let toConfig = JSON.parse(fs.readFileSync(`config/aws/${tag}.json`));
        parameters.from_registry_id = fromConfig.registryId;
        parameters.from_access_key_id = fromConfig.accessKeyId;
        parameters.from_secret_access_key = fromConfig.secretAccessKey;
        parameters.from_region = fromConfig.region;
        parameters.from_env = src;
        parameters.to_registry_id = toConfig.registryId;
        parameters.to_access_key_id = toConfig.accessKeyId;
        parameters.to_secret_access_key = toConfig.secretAccessKey;
        parameters.to_region = toConfig.region;
        parameters.to_env = tag;
        return jenkins.build(jobName, parameters);
    }
}

module.exports = (modules) => {
    jenkins.init(modules)
    return jenkins;
};
