
var services = {};
var containers = {};
var envs = {};
var ecr = {};

var debug = null;

function highlight($items) {
    $items.css("box-shadow", "0 2px 5px 0 #007bff, 0 2px 10px 0 #007bff");
}

function unhighlight($items) {
    $items.css("box-shadow", "");
}

function toggleAll($items, action) {
    if(!$items.length) {
        return;
    }

    if(!action) {
        if($items.filter(":visible").length) {
            action = "hide";
        }
        else {
            action = "show";
        }
    }
    $items.first().collapse(action);
    setTimeout(function() {
        var $left = (action == "hide") ? $items.filter(":visible") : $items.filter(":hidden");
        toggleAll($left, action);
    }, 0);
}

var loaders = {
    
    login: function($html, data) {
        var $button = $html.find(".login");
        $button.click(function() {
            login($("#email").val(), $("#pwd").val(), data.callback);
        });
    },
    
    hItems: function($html, items) {
        for(var i = 0; i < items.length; i++) {
            var $col = $("<div/>");
            $col.addClass("col");
            $html.append($col);
            render(items[i], $col);
        }
    },
    
    vItems: function($html, items) {
        for(var i = 0; i < items.length; i++) {
            render(items[i], $html);
        }
    },
    
    frame: function($html, data) {
        data.id = "frame-" + data.name;
        $html.attr("id", data.id);

        var $itemsContainer = $html.find(".items").first();
        for(var i = 0; i < data.items.length; i++) {
            var $col = $("<div/>");
            $col.addClass("col");
            $itemsContainer.append($col);
            render(data.items[i], $col);
        }

        var $title = $html.find(".title").first();
        $title.click(function() {
            $itemsContainer.collapse("toggle");
        });
        if(data.src) {
            var $flow = $html.find(".main-flow").first();
            $flow.collapse("show");
        }
    },
    
    app: function($html, data) {
        var app = data.app;
        if(data["tag-prefix"]) {
            app += "-" + data["tag-prefix"];
        }
        var clazz = "app-" + app;
        $html.addClass(clazz);
        $html.hover(function() {
            highlight($("." + clazz));
        }, function() {
            unhighlight($("." + clazz));
        });
    },
    
    tag: function($html, data) {
        loaders.app($html, data);
        
        var $tagsContainer = $html.find(".tag-tags").first();
        var $title = $html.find(".title").first();
        $title.click(function() {
            $tagsContainer.collapse("toggle");                    
        });
    },
    
    env: function($html, data) {
        envs[data.tag] = data.name;
        data.id = "env-" + data.tag;
        $html.attr("id", data.id);
        var $itemsContainer = $html.find(".items").first();
        var $header = $html.find(".env-header").first();
        $header.click(function() {
            $itemsContainer.collapse("toggle");
        });
        $html.find(".env-table-title").click(function() {
            var $tr = $(this);
            var section = $tr.attr("data-section");
            toggleAll($html.find(".env-service-" + section));
        });

        var $envRollback = $html.find(".env-rollback").first();
        if(data.src) {
            $envRollback.click(function() {
                buildJenkinsJob("Rollback-Tag-Docker", {
                    tag_to_roll_back: data.tag
                });
            });
        }
        else {
            $envRollback.addClass("disabled");
        }

        if(data.ecr) {
            var $ecr = $html.find(".ecr");
            $ecr.attr("id", "ecr-" + data.id);
            $ecr.collapse("show");
            var $ecrItemsContainer = $ecr.find(".ecr-items");
            loaders.hItems($ecrItemsContainer, data.ecr.filter(tag => tag.type == "tag"));
            var $ecrHeader = $ecr.find(".ecr-header");
            $ecrHeader.click(function() {
                $ecrItemsContainer.collapse("toggle");
            });
            
            if(data.src) {
                $deploy = $html.find(".env-deploy");
                $deploy.click(function() {
                    buildJenkinsJob("Tag-Docker", {
                        from_tag: data.src,
                        to_tag: data.tag
                    });
                });

                var $flow = $html.find(".flow-ecr").first();
                $flow.collapse("show");

                $tagJobs = $html.find(".tag-jobs");
                $tagJobs.attr("id", "tag-jobs-" + data.id);
                $tagJobs.collapse("show");
                var $tagJobsItemsContainer = $tagJobs.find(".tag-jobs-items");
                var jobs = data.ecr.map(tag => (tag.type == "jenkins") ? tag :  {
                    type: "jenkins-tag",
                    name: tag.name,
                    app: tag.app,
                    os: tag.os,
                    "tag-prefix": tag["tag-prefix"],
                    parameters: {
                        image: tag.app,
                        from_tag: data.src,
                        to_tag: data.tag
                    }
                });
                loaders.hItems($tagJobsItemsContainer, jobs);
                var $tagJobsHeader = $tagJobs.find(".tag-jobs-header");
                $tagJobsHeader.click(function() {
                    $tagJobsItemsContainer.collapse("toggle");
                });
            }
            else {
                $main = $html.find(".env-main");
                $main.attr("id", "main-" + data.id);
            }
        } 
        
        var $testsResults = $html.find(".tests-results").first();
        var $testsHeader = $html.find(".env-tests-header").first();
        $testsHeader.click(function() {
            $testsResults.collapse("toggle");
        });
    },

    "jenkins-tag": function($html, data) {
        var id = data.app + "-" + data.parameters.from_tag + "-" + data.parameters.to_tag;
        if(data["tag-prefix"]) {
            id = data.app + "-" + data["tag-prefix"] + "-" + data.parameters.from_tag + "-" + data["tag-prefix"] + "-" + data.parameters.to_tag;
        }

        $html.attr("id", "jenkins-tag-" + id);
        loaders.app($html, data);

        var $body = $html.find(".jenkins-body");
        var $header = $html.find(".jenkins-header");
        $header.click(function() {
            $body.collapse("toggle");
        });

        var $buildButten = $html.find(".deploy");
        $buildButten.click(function() {
            console.log(data);
            buildJenkinsJob("Tag-Docker-" + data.os, data.parameters);
        });
    },

    jenkins: function($html, data) {
        $html.attr("id", "jenkins-" + data.name);
        if(data.app) {
            loaders.app($html, data);
        }

        var $body = $html.find(".jenkins-body");
        var $header = $html.find(".jenkins-header");
        $header.click(function() {
            $body.collapse("toggle");
        });

        var $buildButten = $html.find(".build");
        $buildButten.click(function() {
            console.log(data);
            buildJenkinsJob(data.name, data.parameters);
        });
    },

    service: function($html, data) {
        $html.attr("id", "service-" + data.Id);
        var serviceData = {
            id: data.Id,
            app: data.app, 
            tag: data.tag
        };

        $rollback = $html.find('.service-rollback');
        if(data.app) {
            if(!services[data.app]){
                services[data.app] = {};
            }
            services[data.app][data.tag] = serviceData;

            if(data.tag.match(/^\d+[.]\d+[.]\d+$/)) {
                $version = $html.find('.service-version');
                $version.text("(" + data.tag + ")");
                $rollback.addClass('disabled');
            }
            else if(ecr[data.app] && ecr[data.app][data.tag]){
                updateService(serviceData, ecr[data.app][data.tag]);
            }
        }
        else {
            $rollback.addClass('disabled');
        }
        
        $rollback.click(function() {
            var os = "Linux";
            if(    data.Spec 
                && data.Spec.TaskTemplate
                && data.Spec.TaskTemplate.Placement
                && data.Spec.TaskTemplate.Placement.Constraints) {
                    data.Spec.TaskTemplate.Placement.Constraints.forEach(function(constraint) {
                        if(constraint.match(/node.platform.os\s?==\s?windows/)) {
                            os = "Windows";   
                        }
                    });
                }
            buildJenkinsJob("Rollback-Tag-Docker-" + os, {
                tag_to_roll_back: data.env
            })
        });
    },

    "container-info": function($html, data) {
    },

    container: function($html, data) {
        $html.attr("id", "container-" + data.Id);
        
        if(data.app) {
            loaders.app($html, data);
        
            if(!containers[data.app]){
                containers[data.app] = {};
            }
            if(!containers[data.app][data.tag]){
                containers[data.app][data.tag] = [];
            }
            containers[data.app][data.tag].push(data);
                                
            if(ecr[data.app] && ecr[data.app][data.tag]){
                updateContainer(data, ecr[data.app][data.tag]);
            }
        }


        $html.click(function() {
            pop({
                type: "container-info",                        
                app: data.app, 
                timestamp: data["@timestamp"],
                version: data.version,
                digest: data.digest,
                state: data.State,
                // ports: data.NetworkSettings.Ports,
                // mounts: data.Mounts,
                // env: data.Config.Env,
                labels: data.Config.Labels
            });
        });
    },

    notify: function($html, data) {
        setTimeout(function() {
            $html.remove();
        }, 5000);
    },
    
    "h-repeater": function($html, data) {
        var $itemsContainer = $html.find(".items").first();
        loaders.hItems($itemsContainer, data.items);
    },
    
    "v-repeater": function($html, data) {
        var $itemsContainer = $html.find(".items").first();
        loaders.vItems($itemsContainer, data.items);
    }
};

function render(data, $parent) {
    if(debug == data.type + "-" + data.name) {
        console.log(data);
    }
    if(!$parent) {
        $parent = $("#diagramContainer");
    }
    var $html = $("<div/>");
    $html.addClass(data.type);
    if(data.classes) {
        data.classes.forEach(clazz => $html.addClass(clazz));
    }
    $parent.append($html);
    $html.loadTemplate("templates/" + data.type + ".html", data, {                    
        complete: function() {
            if(loaders[data.type]) {
                loaders[data.type]($html, data);
            }
        }
    });
    
    if(data.name) {
        $html.hover(function() {
            debug = data.type + "-" + data.name;
        }, function() {
            debug = data.type + "-" + data.name;
        });
    }
}

function notify(type, title, message) {
    render({
        type: "notify",
        class: "bg-" + type,
        title: title,
        message: message
    }, $("#notificationsContainer"));
}

function notifyError(title, message) {
    notify("danger", title, message);
}

function notifySuccess(title, message) {
    notify("success", title, message);
}

function pop(data) {
    $modal = $("<div/>");
    $modal.addClass("modal");
    $('body').append($modal);
    render(data, $modal);
    $modal.modal();
}

function renderStatus(data) {
    if(!data.name) {
        data.name = data.Id;
    }

    var $env = $("#env-" + data.env);
    if(!$env.length) {
        console.error("Environment [" + data.env + "] not found for " + data.type + ": ", data);
        return;
    }
    var $table = $env.find(".env-table");
    switch(data.type) {
        case "container":
        var $serviceTR = $("#" + data.serviceId);
        if(!$serviceTR.length) {
            renderStatus({
                type: "service",
                env: data.env,
                name: data.serviceName,
                namespace: data.namespace,
                Id: data.serviceId,
            });
            $serviceTR = $("#" + data.serviceId);
        }
        
        var $nodeTH = $("#" + data.nodeId);
        if(!$nodeTH.length) {
            renderStatus({
                type: "node",
                env: data.env,
                Description: {
                    Hostname: data.serverName
                },
                Id: data.nodeId,
            });
            $nodeTH = $("#" + data.nodeId);
        }
        var index = $nodeTH.index();
        var tdsToAdd = index - $serviceTR.find("td").length;
        if(tdsToAdd > 0) {
            var $tds = $("<td/>".repeat(tdsToAdd));
            $serviceTR.append($td);
        }
        var $td = $serviceTR.find("td:nth-child(" + (index + 1) + ")");
        $html = $("<div/>");
        $html.attr("id", data.Id);
        $td.append($html);
        render(data, $html);
        break;

        case "image":
        break;

        case "service":
        var section = data.name.replace(/_.+$/, "");
        var $section = $table.find(".env-" + section);                
        data.name = data.name.replace(/^[^_]+_/, "");
        var $tr = $("<tr/>");
        $tr.attr("id", data.Id);
        $tr.addClass("env-service-" + section);
        if(section == "utils") {
            $tr.addClass("collapse hide");
        }
        else {
            $tr.addClass("collapse show");
        }
        $tr.insertAfter($section);
        var $td = $("<td/>")
        $td.addClass("table-info");
        $tr.append($td);                
        render(data, $td);
        
        var tdsCount = $table.find("th").length; 
        $tr.append("<td/>".repeat(tdsCount - 1));
        break;

        case "node":
        var $tr = $table.find("thead").find("tr");
        var $th = $("<th/>")
        $th.attr("id", data.Id);
        $tr.append($th);
        render(data, $th);
        
        $col = $("<col/>");
        $col.addClass("col-node-" + data.Id);
        if(data.Status && data.Status.State == "down") {
            $col.addClass("table-danger");
        }
        $table.find("colgroup").append($col);

        var tdsCount = $table.find("th").length;
        $table.find("tr.env-table-title td").attr("colspan", tdsCount);
        // $table.find("tr:not(.env-table-title)").each(function(index, serviceTR) {
        //     $serviceTR = $(serviceTR);
        //     while($serviceTR.find("td").length < tdsCount) {
        //         $serviceTR.append("<td/>");
        //     }
        // });
        break;
    }
}

function updateStatus(data) {
    var $html = $("#" + data.Id);

    switch(data.type) {
        case "container":
        if(data.dead) {
            if(!$html.length) {
                $html.remove();
            }
            return;
        }
        break;

        case "image":
        return;

        case "service":
        var regex = /^([^@]+)/g;
        var matches = regex.exec(data.Spec.Labels["com.docker.stack.image"]);
        if(matches) {
            var image = matches[1].split("/").pop().split(":");
            data.app = image[0];
            if(image.length > 1) {
                data.tag = image[1];
            }
            else {
                data.tag = "latest";
            }
        }
        else {
            console.error("Couldn't parse iamge name: " + data.Spec.Labels["com.docker.stack.image"]);
        }
        
        if(data.tag.match(/^linux-/)) {
            data["tag-prefix"] = "linux";
        }
        if(data.tag.match(/^windows-/)) {
            data["tag-prefix"] = "windows";
        }

        data.namespace = data.Spec.Labels["com.docker.stack.namespace"];
        data.name = data.Spec.Name;
        break;

        case "node":
        break;
    }

    if(!$html.length) {
        renderStatus(data);
        $html = $("#" + data.Id);                
        if(!$html.length) {
            return;
        }
    }
}

function calcTimeDiff(timestamp) {
    var now = new Date().getTime();
    var secondsAgo = (now - timestamp) / 1000;
    if(secondsAgo < 60) {
        return "Just now";
    }
    if(secondsAgo < 120) {
        return "A minute ago";
    }
    if(secondsAgo < 60 * 60) {
        var minutes = Math.floor(secondsAgo / 60);
        return minutes + " minutes ago";
    }
    if(secondsAgo > 60 * 60 * 24) {
        var days = Math.floor(secondsAgo / 60 / 60 / 24);
        return days + " days ago";
    }
    var hours = Math.floor(secondsAgo / 60 / 60);
    var minutesLeft = secondsAgo - (hours * 60 * 60);
    var minutes = Math.floor(minutesLeft / 60);
    return hours + " hours and " + minutes + " ago";
}

function updateJenkinsTag(jobName, job) {
    if(!job.builds) {
        return;
    }

    Object.keys(job.builds).forEach(buildNumber => {
        var build = job.builds[buildNumber];
        var env = build.parameters.to_tag;
        var src = build.parameters.from_tag;

        var img;
        if(build.building) {
            img = "blue_anime.gif";
        }
        else if(build.result == "FAILURE") {
            img = "red.png";
        }
        else if(build.result == "SUCCESS") {
            img = "blue.png";
        }
        else {
            console.error("Build result not handled: " + build.result);
        }

        var $img;
        if(jobName == "Tag-Docker") {
            var $env = $("#env-" + env);
            $img = $env.find(".tag-jobs-status");
        }
        else {
            var app = build.parameters.image;
            var $job = $("#jenkins-tag-" + app + "-" + src + "-" + env);
            $img = $job.find(".jenkins-status");
            updateBuild($job, build);
        }
        $img.attr("src", "images/" + img);
    });
}

function updateBuild($html, build) {
    var $lastBuild = $html.find(".jenkins-last-build");
    if(build) {
        $lastBuild.attr("href", build.url);
        $lastBuild.html(calcTimeDiff(build.timestamp));
        $progressBar = $html.find(".jenkins-progress");
        if(build.building) {
            $progressBar.css("width", Math.min(build.percentage, 100) + "%");
        }
        else {
            $progressBar.css("width", "0px");
        }
    }
}

function updateJenkinsJob(jobName, job) {
    if(jobName.match(/^Tag-Docker/)) {
        return updateJenkinsTag(jobName, job);
    }

    if(debug == "jenkins-" + jobName) {
        console.log(jobName, job);
    }
    var $html = $("#jenkins-" + jobName);
    if(job.inQueue) {
        $html.find(".jenkins-status").attr("src", "images/in_queue.png");
    }
    else if(job.color.match(/_anime$/)) {
        $html.find(".jenkins-status").attr("src", "images/" + job.color + ".gif");
    }
    else {
        $html.find(".jenkins-status").attr("src", "images/" + job.color + ".png");
    }
    $html.find(".jenkins-header").attr("title", job.description);

    updateBuild($html, job.lastBuild);
}

function updateService(service, ecr) {
    if((debug == "service-" + service.id) || (debug == "ecr-" + service.app)) {
        console.log("update-service", service, ecr);
    }

    if(ecr.version) {
        $html = $("#service-" + service.id);
        $version = $html.find('.service-version');
        $version.text("(" + ecr.version + ")");
    }
}

function updateContainer(container, ecr) {
    if(!container.kaltura) {
        return;
    }

    if((debug == "container-" + container.Id) || (debug == "ecr-" + container.app)) {
        console.log("update-container", container, ecr);
    }

    $html = $("#container-" + container.Id);
    $img = $html.find(".container-status");
    if(container.running) {
        if(container.digest == ecr.digest) {
            $img.attr("src", "images/blue.png");
        }
        else {
            $img.attr("src", "images/red.png");
        }
    }
    else {
            $img.attr("src", "");
    }
}

function updateRegistryTag(app, tag, data) {
    var env = tag;
    if(tag.match(/^linux-/)) {
        data["tag-prefix"] = "linux";
        env = tag.replace(/^linux-/, "");
    }
    if(tag.match(/^windows-/)) {
        data["tag-prefix"] = "windows";
        env = tag.replace(/^windows-/, "");
    }
       
    // TODO handle _stable tags

    var $env = $("#env-" + env);
    if(!$env.length) {
        return;
    }

    var $tag = $env.find(".ecr-items").find('.app-' + app);
    if(data.version) {
        var $version = $tag.find('.tag-version');
        $version.text("(" + data.version + ")");
    }
    if(data.tags && data.tags.length) {
        var $tags = $tag.find('.tag-tags');
        $tags.text("Deplyed also in:");
        $ul = $("<ul/>");
        $tags.append($ul);
        data.tags.forEach(function(envTag) {
            if(envs[envTag]) {
                $ul.append("<li>" + envs[envTag] + "</li>");
            }
        });
    }

    if(!ecr[app]) {
        ecr[app] = {};
    }
    ecr[app][tag] = data;

    if(containers[app] && containers[app][tag]){
        containers[app][tag].forEach(container => updateContainer(container, data));
    }
    if(services[app] && services[app][tag]){
        updateService(services[app][tag], data);
    }
}
