

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
                api.permissions = user.permissions;
                user.type = "user-header";
                render(user, $("#userDetails"));
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

    buildJenkinsJob: function(name, parameters, env) {
        $.ajax("api/build", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                job: name,
                env: env,
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
                var regex = new RegExp("^" + env + "-");
                Object.keys(data).forEach(repositoryName => {
                    var repositoryData = data[repositoryName];
                    var $tag = $("#tag-" + repositoryName);
                    if(!$tag.length) {
                        var $env = $("#env-" + env);                        
                        var $tags = $env.find(".tag-jobs-items");
                        var $col = $("<div/>");
                        $col.addClass("col");
                        $tags.append($col);
                        render({
                            type: "tag",
                            tag: env,
                            src: $env.attr('data-src'),
                            repository: repositoryName,
                            name: repositoryName.replace(regex, ""),
                            app: repositoryName.replace(regex, ""),
                            tags: repositoryData
                        }, $col);
                    }
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
        $("#diagramContainer").empty();
        $.ajax("api/flow", {
            success: function(flow) {
                flow.forEach(function(item) {	
                    render(item);	
                });
                websocket.init();
            }	
        });	
    },

    loadFrame: function(parentId) {
        $.ajax("api/frame", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                parentId: parentId
            }),
            success: function(envs) {
                envs.forEach(loaders.callbacks[parentId]);
            }
        });
    },

    status: function(tag, src) {
        $.ajax("api/status", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                tag: tag, 
                src: src
            })
        });
    },
    
    logout: function() {
        $("#userDetails").empty();
        $("#diagramContainer").empty();
        $.ajax("api/logout", {
            success: function() {
                pop({	
                    type: "login",	
                    callback: api.loadFlow	
                });
            }	
        });	
    },
    
    getUser: function() {
        $("#diagramContainer").empty();
        $.ajax("api/user", {
            success: function(user) {
                api.permissions = user.permissions;
                user.type = "user-header";
                render(user, $("#userDetails"));
                api.loadFlow();
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

    loadUsers: function($parent) {
        api.roles(function(roles) {
            $.ajax("api/users", {
                success: function(users) {
                    users.forEach(function(user) {	
                        $html = $("<tr/>");
                        $html.addClass("user");
                        $parent.append($html);

                        user.type = "user";
                        user.roles = roles;
                        render(user, $html, {dontWrap: true});	
                    });
                }
            });	
        });
    },
    
    roles: function(callback) {
        $.ajax("api/roles", {
            success: callback,	
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
    
    'accept-register': function({email}) {
        api.roles(function(roles) {
            render({
                type: 'accept-register',
                roles: roles,
                email: email
            });
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

    updateMyDetails: function(user) {
        $.ajax("api/updateMyDetails", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify(user),
            success: function() {
                notifySuccess("User Details", "User details updated");
            },	
            error: function(jqXHR, textStatus, errorThrown) {
                notifyError("User Details", "Failed to update user details");
            }
        });
    },

    updateUser: function(email, user) {
        $.ajax("api/updateUser", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                email: email,
                user: user
            }),
            success: function() {
                notifySuccess("User Update", "User details updated");
            },	
            error: function(jqXHR, textStatus, errorThrown) {
                notifyError("User Update", "Failed to update user details");
            }
        });
    },

    deleteUser: function(email, callback) {
        $.ajax("api/deleteUser", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                email: email
            }),
            success: function() {
                callback();
                notifySuccess("User Delete", "User deleted");
            },	
            error: function(jqXHR, textStatus, errorThrown) {
                notifyError("User Delete", "Failed to delete user");
            }
        });
    },

    impersonateUser: function(email) {
        $.ajax("api/impersonateUser", {
            method: "POST",
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({
                email: email
            }),
            success: function(user) {
                $("#userDetails").empty();
                api.permissions = user.permissions;
                user.type = "user-header";
                render(user, $("#userDetails"));
                api.loadFlow();
            },	
            error: function(jqXHR, textStatus, errorThrown) {
                notifyError("User Impersonation", "Failed to impersonate");
            }
        });
    },

    unimpersonate: function() {
        $.ajax("api/unimpersonateUser", {
            success: function(user) {
                $("#userDetails").empty();
                user.type = "user-header";
                render(user, $("#userDetails"));
                api.loadFlow();
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
