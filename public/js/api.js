

var api = {
    login: function(email, password, callback) {    
    
        $.ajax("api/login", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                email: email,
                password: password
            }),
            success: function(user) {
                if(callback) {
                    callback(user);
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

    forgotPassword: function(email) {    
    
        $.ajax("api/forgotPassword", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                email: email
            }),
            success: function() {
                notifySuccess("E-mail was sent");
            },
            error: function(jqXHR, textStatus, errorThrown) {
                notifyError("Failed to reset password: " + errorThrown);
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
                if(data) {
                    data.forEach(job => updateJenkinsJob(job));
                }
                else {
                    api.jobsLoaded = false;
                }
            },
            error: function(jqXHR, textStatus, errorThrown) {
                api.jobsLoaded = false;
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
    },
    
    'accept-register': function({email}) {
        $.ajax("api/roles", {
            success: function(roles) {
                render({
                    type: 'accept-register',
                    roles: roles,
                    email: email
                });
            },	
            error: function(jqXHR, textStatus, errorThrown) {	
                if(jqXHR.status == 401) {	
                    pop({	
                        type: "login",	
                        callback: function() {
                            api["accept-register"]({email: email});
                        }	
                    });	
                }	
            }	
        });	
    },

    createUser: function(email, role) {
        $.ajax("api/createUser", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                email: email,
                role: role
            }),
            success: function() {
                notifySuccess("Registration", "User created e-mail: " + email, {
                    Close: function() {
                        window.close();
                    }
                });
            },	
            error: function(jqXHR, textStatus, errorThrown) {
                notifyError("Registration", "Failed to create user for e-mail: " + email);
            }
        });
    },

    'update-info': function() {
        pop({	
            type: "login",	
            callback: function(user) {
                console.log(user);
                pop({
                    type: 'update-info',
                    username: user.username
                });
            }	
        });	
    },

    updateUser: function(username, password) {
        $.ajax("api/updateUser", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                username: username,
                password: password
            }),
            success: function() {
                notifySuccess("Registration", "User details updated");
            },	
            error: function(jqXHR, textStatus, errorThrown) {
                notifyError("Registration", "Failed to update user details");
            }
        });
    },
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
