

var api = {
    login: function(email, password, callback) {    
    
        $.ajax("api/login", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                email: email,
                password: password
            }),
            success: function() {
                if(callback) {
                    callback();
                }
            },
            error: function(jqXHR, textStatus, errorThrown) {
                if(jqXHR.status == 500) {
                    pop({
                        type: "login",
                        message: errorThrown,
                        callback: callback
                    });
                }
            }
        });
    },
    
    register: function(email) {    
    
        $.ajax("api/register", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                email: email
            }),
            success: function() {
                notifySuccess("Registration request sent to administrator");
            },
            error: function(jqXHR, textStatus, errorThrown) {
                notifySuccess("Registration request failed: " + errorThrown);
            }
        });
    },

    buildJenkinsJob: function(name, parameters) {
        $.ajax("api/build", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                job: name,
                parameters: parameters
            }),
            success: function() {
                notifySuccess("Build " + name, "Build started");
            },
            error: function(jqXHR, textStatus, errorThrown) {
                notifyError("Build " + name, "Build failed");
            }
        });
    },

    deployRegistry: function(data) {
        $.ajax("api/deploy", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify(data),
            success: function() {
                notifySuccess("Deploy " + name, "Deploy started");
            },
            error: function(jqXHR, textStatus, errorThrown) {
                notifyError("Deploy " + name, "Deploy failed");
            }
        });
    },

    updateRegistryStatus: function(env) {
        $.ajax("api/ecr", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                env: env
            }),
            success: function(data) {
                Object.keys(data).forEach(repositoryName => {
                    var repositoryData = data[repositoryName];
                    Object.keys(repositoryData).forEach(tag => updateRegistryTag(env, repositoryName, tag, repositoryData[tag]));
                });
            }
        });
        $.ajax("api/deployments", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                env: env
            }),
            success: function(data) {
                data.forEach(deploy => updateDeploy(deploy));
            }
        });
    },

    jobsLoaded: false,
    updateJenkinsStatus: function(force) {
        if(api.jobsLoaded && !force) {
            return;
        }
        api.jobsLoaded = true;
        $.ajax("api/jobs", {
            success: function(data) {
                data.forEach(job => updateJenkinsJob(job));
            }
        });
    },

    updateTests: function(env) {
        $.ajax("api/tests", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                env: env
            }),
            success: function(data) {
                if(data) {
                    data.forEach(updateTest);
                }
            }
        });
    },

    updateCloudStatus: function(api, env, next) {
        $.ajax("api/" + api, {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                env: env
            }),
            success: function(data) {
                if(data) {
                    data.forEach(item => updateStatus(item));
                    if(next) {
                        next();
                    }
                }
            }
        });
    },
    
    loadFlow: function() {
        $.ajax("api/flow", {
            success: function(flow) {
                flow.forEach(function(item) {	
                    render(item);	
                });
                websocket.init();
            },	
            error: function(jqXHR, textStatus, errorThrown) {	
                if(jqXHR.status == 401) {	
                    pop({	
                        type: "login",	
                        callback: api.loadFlow	
                    });	
                }	
            }	
        });	
    }	    
};

function updateCloud(env) {
    api.updateCloudStatus("nodes", env, function() {
        api.updateCloudStatus("services", env, function() {
            api.updateCloudStatus("containers", env, function() {                
                api.updateRegistryStatus(env);
            });
        });
    })
}