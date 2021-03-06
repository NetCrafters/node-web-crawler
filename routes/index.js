/*
 * Routes handlers
 */

var	util 	 = require('util');

var exec = require('child_process').exec,
	child_process = require('child_process'),
    ejs = require('ejs'),
	fs 			  = require('fs'),
	child_processes = [];

module.exports = function(app, models) {
    /**
     * Set params
     */
    app.param('url', function(req, res, next, value) {
        req.url = value;
        next();
    });

    /**
     * Index
     */
	app.get('/', function(req, res) {
        if (app.config.modules.save_crawlers.enabled) {
            models.crawler.getCrawlers(function(err, crawlers) {
                res.render('index', {
                    port: app.config.server.port,
                    modules: app.config.modules,
                    crawlers: crawlers
                });
            });
        } else {
            res.render('index', {
                port: app.config.server.port,
                modules: app.config.modules
            });
        }
    });

    /**
     * Add a crawler
     */
	app.post("/add", function(req, res) {
        var url   		   = req.body.url,
            auth_user	   = req.body.auth_user,
            auth_pass	   = req.body.auth_pass,
            depth 		   = parseInt(req.body.create_crawler_depth),
            create_sitemap = req.body.create_crawler_sitemap == 1,
            clean 		   = req.body.clean_crawl == 1;

        // set the action
        if (typeof(req.body.save)!='undefined') {
            var save = true;
        } else {
            var save = false;
        }

        // validate url
        var matches = url.match('https?://([^/]*)/?.*');
        if (!matches) {
            util.log('Invalid url given: '+url);
            res.redirect("/");
            return;
        } else {
            var domain = matches[1];
        }

        // save crawler
        if (app.config.modules.save_crawlers.enabled) {
            if (save) {
                // unset the "save" option on last crawl config
                var crawlConfig = req.body;
                crawlConfig.save = false;
                // save
                models.crawler.update({url:url}, {
                    domain: domain,
                    table: 'links_grabbed_'+domain+'s',
                    crawlConfig: JSON.stringify(crawlConfig),
                    lastCrawlDate: new Date().toISOString(),
                    modified: new Date().toISOString()
                }, { upsert: true }, function(err, numberAffected, rawResponse) {
                    if (err) {
                        console.log('Could not save crawler '+domain, err, numberAffected);
                    } else {
                        console.log('Save crawler '+domain, err, numberAffected);
                    }
                });
            } else {
                models.crawler.update({url:url}, {
                    lastCrawlDate: new Date().toISOString()
                }, null, function(err, numberAffected, rawResponse) {
                    if (err) {
                        console.log('Could not save crawler '+domain, err, numberAffected);
                    } else {
                        console.log('Save crawler '+domain, err, numberAffected);
                    }
                });
            }
        }

        // fork our dear child
        var child = child_process.fork("crawling-daemon.js");

        // setup config
        child.send({
            action: "setConfig",
            config: app.config
        });
        
        // send auth credentials to child
        if (auth_user!="" && auth_pass!="") {
            child.send({
                action: "setAuth",
                auth_user: auth_user,
                auth_pass: auth_pass
            });
        }

        // get our child crawlin'
        child.send({
            action: "start",
            url: url,
            clean: clean,
            depth: depth
        });

        child.on("message", function(data) {
            switch (data.message)
            {
                case "auth-required":
                    data.row_id = data.host.replace(/\./g,"");
                    res.render("partials/scraper-stats-row", {data: data, layout: false}, function(err, html)
                    {
                        if (err != null)
                            return;

                        data.html = html;
                        io.sockets.emit('auth-required', data);
                    });

                    break;

                case "general-stats":
                    data.row_id = data.host.replace(/\./g,"");
                    res.render("partials/scraper-stats-row", {data: data, layout: false}, function(err, html)
                    {
                        if (err != null)
                            return;

                        data.html = html;

                        res.render("partials/scraper-general-stats-cell", {data: data, layout: false}, function(err, html)
                        {
                            if (err != null)
                                return;

                            data.stats_html = html;
                            io.sockets.emit('general-stats', data);
                        })
                    });
                    break;

                case "error":
                    io.sockets.emit('error', data);				
                    break;

                case "done-crawling": case "stop-crawling": 
                    if (create_sitemap)
                        child.send({ action: "createSitemap" });
                    else
                        child.kill(); // Terminate crawling daemon

                    io.sockets.emit(data.message, data); // done-crawling | stop-crawling
                    break;


                case "sitemap-created":

                    var sitemap_path = "public/sitemaps/sitemap_"+ data.host +".xml";
                    fs.writeFile(sitemap_path, data.content, function(err) {
                        if (err) {
                            console.log(err);
                        } else {
                            io.sockets.emit('sitemap-ready', {path: sitemap_path.replace("public/", "")})
                            // update crawler sitemap
                            if (app.config.modules.save_crawlers.enabled && save) {
                                models.crawler.update({url:url}, {
                                    sitemap: sitemap_path
                                }, null, function(err, numberAffected, rawResponse) {
                                    if (err) {
                                        console.log('Could not update crawler with sitemap '+domain, err, numberAffected);
                                    } else {
                                        console.log('Updated crawler with sitemap '+domain, err, numberAffected);
                                    }
                                });
                            }
                        }

                        // Terminate crawling daemon
                        child.kill();
                    }); 

                    break;
            }
        });

        // child_processes[url] = child;
        res.redirect("/");
    });

    /**
     * Routes for save_crawlers
     */
    if (app.config.modules.save_crawlers.enabled) {
        /**
         * Delete a crawler
         */
        app.post("/delete", function(req, res) {
            var url  = req.body.url,
                ajax = (typeof(req.body.ajax)!='undefined') ? req.body.ajax : false;

            // validate url
            var matches = url.match('https?://(.*)/?.*');
            if (!matches) {
                console.log('Invalid url given: '+url);
                if (ajax) {
                    res.json({error: true, response: 'Invalid url given: '+url});
                } else {
                    res.redirect("/");
                }
                return;
            } else {
                var domain = matches[1];
            }

            // remove crawler
            models.crawler.remove({url:url}, function(err) {
                if (err) {
                    console.log('Could not delete crawler '+domain, err);
                    if (ajax) {
                        res.json({error: err, response: 'Could not remove crawler '+domain});
                    } else {
                        res.redirect("/");
                    }
                } else {
                    console.log('Deleted crawler '+domain, err);
                    if (ajax) {
                        res.json({error: err, response: 'Deleted crawler '+domain});
                    } else {
                        res.redirect("/");
                    }
                }
            });
            return;
        });

        /**
         * View a crawler
         */
        app.get("/view/:url", function(req, res) {
            var modules = app.config.modules;
            var port = app.config.server.port;

            models.crawler.getCrawler(req.url, function(err, crawler){
                console.log(crawler);
                if (err) {
                    res.redirect("/");
                } else {
                    // get model
                    try {
                        var LinksGrabbedModel = app.mongoose.model(crawler.table);
                    } catch (err) {
                        var LinksGrabbedModel = app.mongoose.model(crawler.table, models.LinksGrabbedSchema);
                    }

                    // get links
                    LinksGrabbedModel.find().sort({url:'ascending'}).exec(function(err, data){
                        for (var i in data) {
                            // set class
                            if (data[i].http_status>=400) {
                                data[i].class = 'error';
                            } else if (data[i].http_status>=300) {
                                data[i].class = 'warning';
                            } else {
                                data[i].class = '';
                            }
                            // extract path for url
                            if (data[i].url) {
                                matches = data[i].url.match(/https?:\/\/[^\/]*(\/.*)/);
                                if (matches && matches[1]) {
                                    data[i].url_path = matches[1];
                                } else {
                                    data[i].url_path = 'null';
                                }
                            } else {
                                data[i].url_path = 'null';
                            }
                            // extract path for source
                            if (data[i].source) {
                                matches = data[i].source.match(/https?:\/\/[^\/]*(\/.*)/);
                                if (matches && matches[1]) {
                                    data[i].source_path = matches[1];
                                } else {
                                    data[i].source_path = 'null';
                                }
                            } else {
                                data[i].source_path = 'null';
                            }
                        }
                        res.render('view', {
                            port: port,
                            modules: modules,
                            crawler: crawler,
                            links: data
                        });
                    });
                }
            });
        });
    }

    /**
     * API
     */
    if (app.config.modules.api.enabled) {
        /**
         * API Functions for "Save Crawlers" module
         */
        if (app.config.modules.save_crawlers.enabled) {
            /**
             * View a crawler
             */
            app.get('/api/crawler/view/:url', function(req, res) {
                models.crawler.getCrawler(req.url, function(err, crawler) {
                    if (err) {
                        res.json({error: err, response: 'Could not find crawler.'});
                    } else {
                        res.json({error: err, response: crawler});
                    }
                });
            });

            /**
             * Run a saved crawler
             */
            app.get('/api/crawler/crawl/:url', function(req, res) {
                models.crawler.getCrawler(req.url, function(err, crawler) {
                    if (err || !crawler) {
                        res.json({error: err, response: 'Could not find crawler.'});
                    } else {
                        // parse params
                        try {
                            params = JSON.parse(crawler.crawlConfig);
                        } catch(err) {
                            res.json({error: true, response: 'Could not read crawl params. Error: '+err});
                            return;
                        }

                        var url   		   = params.url,
                            auth_user	   = params.auth_user,
                            auth_pass	   = params.auth_pass,
                            depth 		   = parseInt(params.create_crawler_depth),
                            create_sitemap = params.create_crawler_sitemap == 1,
                            clean 		   = params.clean_crawl == 1,
                            domain         = crawler.domain;

                        models.crawler.update({url:url}, {
                            lastCrawlDate: new Date().toISOString()
                        }, null, function(err, numberAffected, rawResponse) {
                            if (err) {
                                console.log('Could not update last crawl date '+domain, err);
                            } else {
                                console.log('Updated last crawl date '+domain);
                            }
                        });

                        // fork our dear child
                        var child = child_process.fork("crawling-daemon.js");

                        // setup config
                        child.send({
                            action: "setConfig",
                            config: app.config
                        });

                        // send auth credentials to child
                        if (auth_user!="" && auth_pass!="") {
                            child.send({
                                action: "setAuth",
                                auth_user: auth_user,
                                auth_pass: auth_pass
                            });
                        }

                        // get our child crawlin'
                        child.send({
                            action: "start",
                            url: url,
                            clean: clean,
                            depth: depth
                        });

                        // wiat for "done-crawling" or "sitemap-created" for full completion
                        child.on("message", function(data) {
                            switch (data.message) {
                                case "done-crawling": case "stop-crawling":
                                    if (create_sitemap) {
                                        child.send({ action: "createSitemap" });
                                    } else {
                                        child.kill(); // Terminate crawling daemon
                                        res.json({
                                            error: false,
                                            response: {
                                                message: 'Crawl complete.',
                                                sitemap_url: null
                                            }
                                        });
                                    }
                                    break;

                                case "sitemap-created":
                                    var sitemap_path = "public/sitemaps/sitemap_"+ data.host +".xml";
                                    var sitemap_url = app.config.server.scheme+'://'+app.config.server.host+':'+app.config.server.port+'/sitemaps/sitemap_'+ data.host +'.xml';
                                    fs.writeFile(sitemap_path, data.content, function(err) {
                                        if (err) {
                                            res.json({error: true, response: 'Crawl complete, but failed to write sitemap. Error: '+err});
                                        } else {
                                            // update crawler with sitemap
                                            models.crawler.update({url:url}, {
                                                sitemap: sitemap_path
                                            }, null, function(err, numberAffected, rawResponse) {
                                                if (err) {
                                                    console.log('Could not update crawler with sitemap '+domain, err, numberAffected);
                                                    res.json({
                                                        error: true,
                                                        response: {
                                                            message: 'Crawl complete, but could not update that the crawler has a sitemap.',
                                                            sitemap_url: null
                                                        }
                                                    });
                                                } else {
                                                    console.log('Updated crawler with sitemap '+domain);
                                                    res.json({
                                                        error: false,
                                                        response: {
                                                            message: 'Crawl complete.',
                                                            sitemap_url: sitemap_url
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                        // Terminate crawling daemon
                                        child.kill();
                                    });
                                    break;
                            }
                        });
                    }
                });
            });
        }

        /**
         * Crawl a given url
         *
         * request parameters:
         *      url
         *      auth_user
         *      auth_pass
         *      create_crawler_depth
         *      create_crawler_sitemap
         *      clean_crawl
         */
        app.post('/api/crawl', function(req, res) {
            var url            = req.body.url,
                auth_user      = req.body.auth_user,
                auth_pass      = req.body.auth_pass,
                depth          = parseInt(req.body.create_crawler_depth),
                create_sitemap = req.body.create_crawler_sitemap == 1,
                clean          = req.body.clean_crawl == 1;

            if (!url) {
                console.log('No url given: '+url);
                res.json({error: false, response: 'No url given.'});
                return;
            }

            // validate url
            var matches = url.match('https?://([^/]*)/?.*');
            if (!matches) {
                console.log('Invalid url given: '+url);
                res.json({error: false, response: 'Invalid url given.'});
                return;
            } else {
                var domain = matches[1];
            }

            // fork our dear child
            var child = child_process.fork("crawling-daemon.js");

            // setup config
            child.send({
                action: "setConfig",
                config: app.config
            });

            // send auth credentials to child
            if (auth_user!="" && auth_pass!="") {
                child.send({
                    action: "setAuth",
                    auth_user: auth_user,
                    auth_pass: auth_pass
                });
            }

            // get our child crawlin'
            child.send({
                action: "start",
                url: url,
                clean: clean,
                depth: depth
            });

            // wait for "done-crawling" or "sitemap-created" for full completion
            child.on("message", function(data) {
                switch (data.message) {
                    case "done-crawling": case "stop-crawling":
                        if (create_sitemap) {
                            child.send({ action: "createSitemap" });
                        } else {
                            child.kill(); // Terminate crawling daemon
                            res.json({
                                error: false,
                                response: {
                                    message: 'Crawl complete.',
                                    sitemap_url: null
                                }
                            });
                        }
                        break;

                    case "sitemap-created":
                        var sitemap_path = "public/sitemaps/sitemap_"+ data.host +".xml";
                        var sitemap_url = app.config.server.scheme+'://'+app.config.server.host+':'+app.config.server.port+'/sitemaps/sitemap_'+ data.host +'.xml';
                        fs.writeFile(sitemap_path, data.content, function(err) {
                            if (err) {
                                res.json({
                                    error: true,
                                    response: {
                                        message: 'Crawl complete, but failed to write sitemap. Error: '+err,
                                        sitemap_url: null
                                    }
                                });
                            } else {
                                console.log('Updated crawler with sitemap '+domain);
                                res.json({
                                    error: false,
                                    response: {
                                        message: 'Crawl complete.',
                                        sitemap_url: sitemap_url
                                    }
                                });
                            }
                            // Terminate crawling daemon
                            child.kill();
                        });
                        break;
                }
            });
        });
    }

}

