
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

    callbacks: {},
    
    login: function($html, data) {
        var $login = $html.find(".login");
        $login.click(function() {
            var email = $html.find("input.email").val();
            var password = $html.find("input.password").val();
            // websocket.login(email, password);
            api.login(email, password, data.callback);
        });
        var $forgot = $html.find(".forgot");
        $forgot.click(function() {
            var email = $html.find("input.email").val();
            api.forgotPassword(email);
        });
        var $register = $html.find(".register");
        $register.click(function() {
            $html.find(".password").remove();
            $html.find(".login").remove();
            $html.find(".register").remove();
            $html.find(".mail").collapse('show');
        });
        var $mail = $html.find(".mail");
        $mail.click(function() {
            var email = $html.find("input.email").val();
            api.register(email);
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
        $html.attr("id", "frame-" + data.name);

        var $itemsContainer = $html.find(".items").first();
        var addItem = function(item) {
            item.$parent = $itemsContainer;
            var $col = $("<div/>");
            $col.addClass("col");
            $itemsContainer.append($col);
            render(item, $col);  
        }

        var itemIds = {}
        if(data.items) {
            for(var i = 0; i < data.items.length; i++) {
                addItem(data.items[i]);
                if(data.items[i].id) {
                    itemIds[data.items[i].id] = true;
                }
            }
        }
        
        var envParentId = null;
        if(data.id) {
            envParentId = data.id;
            loaders.callbacks[envParentId] = addItem;
        }
        var $title = $html.find(".title").first();
        $title.click(function() {
            $itemsContainer.collapse("toggle");
            if(envParentId) {
                api.loadFrame(envParentId);
                envParentId = null;
            }
            if(Object.keys(itemIds).length) {
                Object.keys(itemIds).forEach(function(itemId) {
                    api.loadFrame(itemId);
                });
                itemIds = {};
            }
        });
        if(data.src) {
            var $flow = $html.find(".main-flow").first();
            $flow.collapse("show");
        }

        $itemsContainer.on('shown.bs.collapse', function() {
            api.updateJenkinsStatus();
            $itemsContainer
                .find(".env:visible")
                .each(function() {
                    $env = $(this);
                    var env = $env.attr('data-tag');
                    websocket.listen(env);
                    updateCloud(env);
                    api.updateTests(env);
                    var src = $env.attr('data-src');
                    if(src) {
                        api.updateRegistryStatus(src);
                    }
                });
        });

        $itemsContainer.on('hidden.bs.collapse', function() {
            $itemsContainer
                .find(".env:hidden")
                .each(function() {
                    $env = $(this);
                    websocket.unlisten($env.attr('data-tag')); 
                });
        });
    },
    
    app: function($html, data) {
        var app = data.app;
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
        var id = "tag-" + data.tag + "-" + data.app;
        $html.attr("id", id);

        var $tagsContainer = $html.find(".tag-details").first();
        var $title = $html.find(".title").first();
        $title.click(function() {
            $tagsContainer.collapse("toggle");                    
        });
        
        var $buildButten = $html.find(".deploy");
        if(data.jobName) {
            $buildButten.show();
            $buildButten.removeAttr("disabled");
            $buildButten.text('Build');
            $buildButten.click(function() {
                api.buildJenkinsJob(data.jobName, data.parameters, data.tag);
            });
        }
        else if(data.src) {
            $html.addClass("src-" + data.src + "-" + data.app);
            $buildButten.click(function() {
                $select = $html.find(".deploy-version");
                var params = {
                    tag: $select.val(),
                    app: data.app,
                    from_env: data.src,
                    to_env: data.tag,
                    os: 'linux'
                };                
                if(['phoenix', 'web-services', 'ingest', 'filebeat'].indexOf(data.app) >= 0) {
                    params.os = 'windows';
                }
                api.deployRegistry(params);
            });
        }
        else {
            $html.find(".jenkins-status").remove();
            $html.find(".tag-deploy").remove();
        }
        
        Object.keys(data.tags).forEach(tag => updateRegistryTag(data.env, data.repository, tag, data.tags[tag]));
    },
    
    env: function($html, data) {
        data.id = "env-" + data.tag;
        $html.attr("id", data.id);
        $html.attr("data-tag", data.tag);

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

        var $envDeploy = $html.find(".env-deploy");
        var $envRollback = $html.find(".env-rollback");
        if(data.src) {
            $html.attr("data-src", data.src);
            $envRollback.click(function() {
                api.buildJenkinsJob("Rollback-Tag-Docker-" + data.tag, null, data.tag);
            });
            
            $envDeploy.click(function() {
                api.deployRegistry(data);
            });
        }
        else {
            $envDeploy.remove();
            $envRollback.remove();
            $html.find(".tag-jobs-status").remove();
        }

        var $ecrItemsContainer = $html.find(".tag-jobs-items");
        loaders.hItems($ecrItemsContainer, []);
        var $tagJobsHeader = $html.find(".tag-jobs-header");
        $tagJobsHeader.click(function() {
            $ecrItemsContainer.collapse("toggle");
        });
        
        var $testsResults = $html.find(".tests-results").first();
        var $testsHeader = $html.find(".env-tests-header").first();
        $testsHeader.click(function() {
            $testsResults.collapse("toggle");
        });

        if(data.links) {
            var $main = $html.find(".env-main");
            data.links.forEach(function(links) {
                var $links = $('<div class="card-footer" />')
                $main.append($links)
                links.forEach(function(link) {
                    $links.append('<a target="_blank" class="card-link" href="' + link.url + '">' + link.text + '</a>');
                });
            });
        }
    },

    "jenkins-tag": function($html, data) {
        var id = data.app + "-" + data.parameters.from_tag + "-" + data.parameters.to_tag;
        $html.attr("id", "jenkins-tag-" + id);
        loaders.app($html, data);

        var $body = $html.find(".jenkins-body");
        var $header = $html.find(".jenkins-header");
        $header.click(function() {
            $body.collapse("toggle");
        });

        var $buildButten = $html.find(".deploy");
        $buildButten.click(function() {
            api.buildJenkinsJob("Tag-Docker-" + data.os, data.parameters);
        });
    },

    test: function($html, data) {
        $html.attr("id", "test-" + data.id);
        
        updateTestProgress($html, data);
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
            $html.find(".jenkins-status").attr("src", "images/in_queue.png");
            api.buildJenkinsJob(data.name, data.parameters);
        });
    },

    service: function($html, data) {
        $html.attr("id", "service-" + data.Id);
        if(data.digest) {
            $html.addClass("digest-" + data.digest);
        }

        var serviceData = {
            id: data.Id,
            app: data.app, 
            tag: data.tag
        };

        $rollback = $html.find('.service-rollback');
        if(data.app) {
            if(data.tag.match(/^\d+[.]\d+[.]\d+$/)) {
                $version = $html.find('.service-version');
                $version.text("(" + data.tag + ")");
                $rollback.addClass('disabled');
            }
            // TODO update version and stable version
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
            api.buildJenkinsJob("Rollback-Tag-Docker-" + os, {
                tag_to_roll_back: data.env
            })
        });
    },

    "container-info": function($html, data) {
    },

    container: function($html, data) {
        $html.attr("id", "container-" + data.Id);
        if(data.kaltura) {
            $html.attr("data-digest", data.digest);
        }
        else {
            $html.find(".container-status").remove();
        }
        
        if(data.app) {
            loaders.app($html, data);
        }


        $html.click(function() {
            pop({
                type: "container-info",                        
                app: data.app, 
                timestamp: data.timestamp,
                version: data.version,
                digest: data.digest,
                dead: data.dead ? "true" : "false",
                running: data.running ? "true" : "false",
                startedAt: data.startedAt,
                restarting: data.restarting ? "true" : "false",
                labels: data.labels,
                image: data.image,
                serviceName: data.serviceName,
                serviceId: data.serviceId,
                namespace: data.namespace,
                nodeId: data.nodeId,
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
        if(data.items) {
            loaders.hItems($itemsContainer, data.items);
        }
        if(data.id) {
            loaders.callbacks[data.id] = function(item) {
                loaders.hItems($itemsContainer, [item]);
            };
        }
    },
    
    "v-repeater": function($html, data) {
        var $itemsContainer = $html.find(".items").first();
        if(data.items) {
            loaders.vItems($itemsContainer, data.items);
        }
        if(data.id) {
            loaders.callbacks[data.id] = function(item) {
                loaders.vItems($itemsContainer, [item]);
            };
        }
    },

    'accept-register': function($html, data) {
        var $accept = $html.find(".accept");
        $accept.click(function() {
            api.createUser(data.email, $html.find(".user-role").val());
        });
    },

    'update-info': function($html, data) {
        var $save = $html.find(".save");
        $save.click(function() {
            api.updateMyDetails({
                username: $html.find("input.username").val(), 
                password: $html.find("input.password").val()
            });
            api.loadFlow();
            location.hash = "";
        });
    },

    'user-header': function($html, data) {
        var $logout = $html.find(".logout");
        $logout.click(function() {
            api.logout();
        });
        
        if(data.master) {
            var $unimpersonate = $html.find(".unimpersonate");
            $unimpersonate.collapse("show");
            $unimpersonate.click(function() {
                api.unimpersonate();
            });
        }
    },

    users: function($html, data) {        
        var $body = $html.find(".users-body");
        var $header = $html.find(".title");
        $header.click(function() {
            $body.collapse("toggle");
        });

        var $itemsContainer = $html.find(".items").first();
        api.loadUsers($itemsContainer);
    },

    user: function($html, data) {        
        var $role = $html.find(".role");

        var $delete = $html.find(".delete");
        $delete.click(function() {            
            api.deleteUser(data.email, function() {
                $html.remove();
            });
        });

        var $impersonate = $html.find(".impersonate");
        $impersonate.click(function() {
            api.impersonateUser(data.email);
        });

        var $update = $html.find(".update");
        $update.click(function() {
            api.updateUser(data.email, {
                userRole: $role.val()
            });
        });
        
        $role.change(function() {
            if($role.val() === data.userRole) {
                $update.collapse("hide");
            }
            else {
                $update.collapse("show");
            }
        });
    }
};

function render(data, $parent, options) {
    if(!$parent) {
        $parent = $("#diagramContainer");
    }

    var $html = $parent;
    if(!options || !options.dontWrap) {
        $html = $("<div/>");
        $html.addClass(data.type);    
        if(data.classes) {
            data.classes.forEach(clazz => $html.addClass(clazz));
        }
    }

    if(options && options.prepend) {
        $parent.prepend($html);
    }
    else {
        $parent.append($html);
    }

    $html.loadTemplate("templates/" + data.type + ".html", data, {                    
        complete: function() {
            if(api.permissions !== "*") {
                $html.find('button[data-requires-permission]').each(function() {
                    var $button = $(this);
                    var requiredPermission = $button.attr('data-requires-permission');
                    var permissionPrefix = $button.attr('data-permission-prefix');
                    if(permissionPrefix) {
                        requiredPermission = data[permissionPrefix] + '-' + requiredPermission;
                    }
                    if(!api.permissions[requiredPermission]) {
                        $button.remove();
                    }
                });
            }
            
            if(loaders[data.type]) {
                loaders[data.type]($html, data);
            }
        }
    });
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
        $td.addClass(data.nodeId);
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
        $th.addClass(data.Id);
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
        break;

        case "node":
        break;
    }

    if(!$html.length) {
        renderStatus(data);
    }
}

function calcTimeDiff(timestamp) {
    var now = new Date().getTime();
    var secondsAgo = (now - timestamp * 1000) / 1000;
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

function updateBuild($html, job) {
    var $lastBuild = $html.find(".jenkins-last-build");
    $lastBuild.attr("href", job.url);
    $lastBuild.html(calcTimeDiff(job["@timestamp"]));
    $progressBar = $html.find(".jenkins-progress");
    if(job.percentage) {
        $progressBar.css("width", Math.min(job.percentage, 100) + "%");
    }
    else {
        $progressBar.css("width", "0px");
    }
}

function updateDeploy(deploy) {
    if(deploy.id == deploy.env) {
        var $html = $("#env-" + deploy.env);
        if(deploy.status == "STARTED") {
            $html.find(".tag-jobs-status").attr("src", "images/blue_anime.gif");
        }
        else {
            $html.find(".tag-jobs-status").attr("src", "images/" + deploy.status + ".png");
        }
    }
    else {
        var app = deploy.id.replace(/:[^:]+$/, '');

        var $html = $("#tag-" + app);
        if(deploy.status == "STARTED") {
            $html.find(".jenkins-status").attr("src", "images/blue_anime.gif");
        }
        else {
            $html.find(".jenkins-status").attr("src", "images/" + deploy.status + ".png");
        }
    }
    
    // updateBuild($html, deploy);
}

function updateJenkinsJob(job) {
    var $html = $("#jenkins-" + job.jobName);
    if(job.status == "STARTED") {
        $html.find(".jenkins-status").attr("src", "images/blue_anime.gif");
    }
    else {
        $html.find(".jenkins-status").attr("src", "images/" + job.status + ".png");
    }

    updateBuild($html, job);
}

function updateService($service, version) {
    $version = $service.find('.service-version');
    $version.text("(" + version + ")");
}

function updateContainer($container, tagDigest) {    
    var containerDigest = $container.attr('data-digest');
    if(!containerDigest) {
        return;
    }

    $img = $container.find(".container-status");
    if(containerDigest == tagDigest) {
        $img.attr("src", "images/SUCCESS.png");
    }
    else {
        $img.attr("src", "images/FAILURE.png");
    }
}

function updateRegistryTag(env, app, tag, data) {
    
    if(data.version) {
        $service = $(".service.digest-" + data.digest);
        updateService($service, data.version);
    }

    var $destinationTags = $(".src-" + app);
    if($destinationTags.length) {
        var $select = $destinationTags.find(".deploy-version");
        if(!$select.find("option[value='" + tag + "']").length) {
            $select.append("<option value=\"" + tag + "\">" + tag + "</option>");
            $destinationTags.find(".deploy").show().removeAttr("disabled");
        }
    }

    var $tag = $("#tag-" + app);
    if(!$tag.length) {
        console.log("Tag not found: #tag-" + app);
        return;
    }    
    $tag.find('.deploy').show();

    var $versions = $tag.find('.tag-version');
    if(!$versions.find('.' + tag).length) {
        $versions.append('<li class="list-group-item text-nowrap ' + tag + '">' + tag + '</li>');
    }
}

function updateTestProgress($test, test) {
    var succeed = test.succeed / test.total * 100;
    var skipped = test.skipped / test.total * 100;
    var failed = test.failed / test.total * 100;
    $test.find('.test-progress-succeed').css("width", succeed + "%");
    $test.find('.test-progress-skipped').css("width", skipped + "%");
    $test.find('.test-progress-failed').css("width", failed + "%");
    $test.find('.test-progress-succeed').attr("title", succeed + "%");
    $test.find('.test-progress-skipped').attr("title", skipped + "%");
    $test.find('.test-progress-failed').attr("title", failed + "%");
    
    var $body;
    if(test.report) {
        $test.find('.new-tab-img').show();

        // var url = "/reports/" + test.id + "/report/index.html";
        // $link = $test.find(".new-tab");
        // $link.attr("href", url);
        
        // $fram = $test.find(".test-content");
        // $fram.attr("src", url);
                
        $resizable = $test.find(".resizable");
        $resizable.resizable();

        $body = $test.find(".test-data");
    }
    else {
        $test.find('.new-tab-img').hide();
        $body = $test.find(".test-info");
    }

    var $header = $test.find(".test-header");
    $header.click(function() {
        $body.collapse("toggle");
    });
}

function updateTest(test) {
    test.type = 'test';
    test.title = 'Core';
    test.startTime = new Date(test.startTime).toUTCString();
    test.endTime = test.endTime ? new Date(test.endTime).toUTCString() : '';

    $test = $('#test-' + test.id);
    if($test.length) {
        updateTestProgress($test, test);
        
        $test.find('.test-startTime').text(test.startTime);
        $test.find('.test-endTime').text(test.endTime);
        $test.find('.test-clientVersion').text(test.clientVersion);
        $test.find('.test-serverVersion').text(test.serverVersion);
        $test.find('.test-total').text(test.total);
        $test.find('.test-succeed').text(test.succeed);
        $test.find('.test-skipped').text(test.skipped);
        $test.find('.test-failed').text(test.failed);

        return;
    }
    
    var $env = $('#env-' + test.env);
    if(!$env.length) {
        console.error('Environment ' + test.env + ' not found');
        return;
    }

    var $testsResults = $env.find('.tests-results');
    render(test, $testsResults, {prepend: true});
}
