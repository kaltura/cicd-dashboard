
function login(email, password, callback) {    
    
    $.ajax("api/login", {
        method: "POST",
        contentType: "application/json; charset=utf-8",
        data: JSON.stringify({
            email: email,
            password: password
        }),
        success: function() {
            callback();
        },
        error: function(jqXHR, textStatus, errorThrown) {
            if(jqXHR.status == 500) {
                pop({
                    type: "login",
                    message: errorThrown,
                    callback: loadFlow
                });
            }
        }
    });
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

function updateRegistryStatus() {
    $.ajax("api/ecr", {
        success: function(data) {
            Object.keys(data).forEach(repositoryName => {
                var repositoryData = data[repositoryName];
                Object.keys(repositoryData).forEach(tag => updateRegistryTag(repositoryName, tag, repositoryData[tag]));
            });
        }
    });
}

function updateJenkinsStatus() {
    $.ajax("api/jobs", {
        success: function(data) {
            Object.keys(data).forEach(jobName => updateJenkinsJob(jobName, data[jobName]));
        }
    });
}

function updateCloudStatus(api, next) {
    $.ajax("api/" + api, {
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

function loadFlow() {
    $.ajax("api/flow", {
        success: function(flow) {
            var left = flow.length;
            var first = true;
            flow.forEach(function(item) {
                item.first = first;
                first = false;
                render(item, null, function() {
                    left--;
                    if(!left) {
                        // mainFlowArrows();
                    }
                });
            });

            updateRegistryStatus();
            updateJenkinsStatus();
            updateCloud();

            setInterval(updateRegistryStatus, 10000);
            setInterval(updateJenkinsStatus, 2000);
            setInterval(updateCloud, 30000);
        },
        error: function(jqXHR, textStatus, errorThrown) {
            if(jqXHR.status == 401) {
                pop({
                    type: "login",
                    callback: loadFlow
                });
            }
        }
    });
}

function updateCloud() {
    updateCloudStatus("nodes", function() {
        updateCloudStatus("services", function() {
            updateCloudStatus("containers");
        });
    })
}
