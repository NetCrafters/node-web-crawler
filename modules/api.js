module.exports = function(app, models) {
    /**
     * API Functions for "Save Crawlers" module
     */
    if (app.config.modules.save_crawlers.enabled) {
        /**
         * View a crawler
         */
        app.get('/1/api/crawler/view/:url', function(req, res) {
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
        app.get('/1/api/crawler/crawl/:url', function(req, res) {
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
    app.post('/1/api/crawl', function(req, res) {
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

    /**
     * Get a sitemap for a url
     *
     * Note: this is the same for post to /1/api/crawl, except
     * create_crawler_sitemap is always true and it does not write the
     * sitemap to the filesystem.
     *
     * request parameters:
     *      url
     *      auth_user
     *      auth_pass
     *      create_crawler_depth
     *      create_crawler_sitemap
     *      clean_crawl
     */
    app.get('/1/api/sitemap', function(req, res) {
        var url            = req.query.url,
            auth_user      = req.query.auth_user,
            auth_pass      = req.query.auth_pass,
            depth          = parseInt(req.query.create_crawler_depth),
            create_sitemap = 1,
            clean          = req.query.clean_crawl == 1;

        if (!url) {
            console.log('No url given: '+url);
            res.send(400, 'No url given');
            return;
        }

        // validate url
        var matches = url.match('https?://([^/]*)/?.*');
        if (!matches) {
            console.log('Invalid url given: '+url);
            res.send(400, 'Invalid url given');
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
                    child.send({ action: "createSitemap" });
                    break;

                case "sitemap-created":
                    res.set('Content-Type', 'application/xml; charset=utf-8');
                    res.send(200, data.content);
                    // Terminate crawling daemon
                    child.kill();
                    break;
            }
        });
    });
}
