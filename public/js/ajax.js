

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
    }
}

function buildJenkinsJob(name, parameters) {
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
}

function deployRegistry(data) {
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
}

function updateRegistryStatus(env) {
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
}

var jobsLoaded = false;
function updateJenkinsStatus(force) {
    if(jobsLoaded && !force) {
        return;
    }
    jobsLoaded = true;
    $.ajax("api/jobs", {
        success: function(data) {
            data.forEach(job => updateJenkinsJob(job));
        }
    });
}

function updateTests(env) {
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
}

function updateCloudStatus(api, env, next) {
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
}

function updateCloud(env) {
    updateCloudStatus("nodes", env, function() {
        updateCloudStatus("services", env, function() {
            updateCloudStatus("containers", env);
        });
    })
}
