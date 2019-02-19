const fs = require('fs');
const jenkinsApi = require('jenkins-api');

const jenkins = {
    jobs: {},

    init: (modules) => {
        jenkins.logger = modules.logger;
        jenkins.client = jenkinsApi.init(modules.config.jenkinsUrl);
        // setInterval(jenkins.updateJobs, 20000);
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

    // updateJob: (jobName, getAllBuilds) => {   
    //     jenkins.client.job_info(jobName, (err, jobData) => {
    //         if (err) {
    //             // jenkins.logger.error('Update job:', err);
    //             if(!jenkins.jobs[jobName]) {
    //                 jenkins.jobs[jobName] = {
    //                     color: "nobuilt"
    //                 }
    //             }
    //         }
    //         else {
    //             if(!jenkins.jobs[jobName]) {
    //                 jenkins.jobs[jobName] = {
    //                     description: jobData.description
    //                 };
    //             }
    //             jenkins.jobs[jobName].inQueue = jobData.inQueue;
    //             jenkins.jobs[jobName].color = jobData.color;

    //             if(getAllBuilds) {
    //                 if(!jenkins.jobs[jobName].builds) {
    //                     jenkins.jobs[jobName].builds = {};
    //                 }

    //                 jobData.builds.forEach(build => jenkins.getBuild(jobName, build.number, buildData => {
    //                     var parameters = buildData
    //                         .actions
    //                         .reduce((action1, action2) => action1.parameters ? action1 : action2)
    //                         .parameters
    //                         .reduce((result, item, index) => {
    //                             result[item.name] = item.value;
    //                             return result;
    //                           }, {});

    //                     jenkins.jobs[jobName].builds[build.number] = {
    //                         url: buildData.url,
    //                         timestamp: buildData.timestamp,
    //                         duration: buildData.duration,
    //                         building: buildData.building,
    //                         result: buildData.result,
    //                         parameters: parameters
    //                     };
    //                 }));
    //             }
    //             else {
    //                 jenkins.getBuild(jobName, jobData.lastBuild.number, buildData => {
    //                     jenkins.jobs[jobName].lastBuild = {
    //                         url: buildData.url,
    //                         building: buildData.building,
    //                         timestamp: buildData.timestamp,
    //                         duration: buildData.duration,
    //                         result: buildData.result
    //                     };
    //                     var duration = new Date().getTime() - buildData.timestamp;
    //                     if(buildData.building) {
    //                         jenkins.jobs[jobName].lastBuild.duration = duration;
    //                         jenkins.jobs[jobName].lastBuild.estimatedLeft = buildData.estimatedDuration - duration;
    //                         jenkins.jobs[jobName].lastBuild.percentage = Math.floor(duration * 100 / buildData.estimatedDuration);
    //                     }
    //                 });
    //             }
    //         }
    //     });
    // },

    // updateJobsData: (frames) => {
    //     frames.forEach(frame => {
    //         if(frame.type == "jenkins") {
    //             jenkins.updateJob(frame.name);
    //         }
    //         if(frame.items) {
    //             jenkins.updateJobsData(frame.items);
    //         }
    //     });
    // },

    // updateJobs: () => {
    //     jenkins.updateJobsData(jenkins.flowData);

    //     jenkins.updateJob('Tag-Docker', true);
    //     jenkins.updateJob('Tag-Docker-Linux', true);
    //     jenkins.updateJob('Tag-Docker-Windows', true);
    // },

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
