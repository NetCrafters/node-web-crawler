module.exports = function(app, models) {
    /**
     * Setup Model
     */
    models.crawler = require('../models/crawler.js')(app.mongoose).model;

    /**
     * Override home route
     */
	app.get('/', function(req, res) {
        models.crawler.getCrawlers(function(err, crawlers) {
            res.render('index', {
                port: app.config.port,
                modules: app.config.modules,
                crawlers: crawlers
            });
        });
    });

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
        var port = app.config.port;

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

    /**
     * On add crawler event
     */
    app.on('add_crawler', function(req, res){
        var url   		   = req.body.url,
            auth_user	   = req.body.auth_user,
            auth_pass	   = req.body.auth_pass,
            depth 		   = parseInt(req.body.create_crawler_depth),
            create_sitemap = req.body.create_crawler_sitemap == 1,
            clean 		   = req.body.clean_crawl == 1,
            domain         = req.domain;

        if (typeof(req.body.save)!='undefined') {
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
    });

    /**
     * On sitemap created event
     */
    app.on('add_crawler:sitemap-created', function(req, res){
        models.crawler.update({url:req.body.url}, {
            sitemap: req.sitemap_path
        }, null, function(err, numberAffected, rawResponse) {
            if (err) {
                console.log('Could not update crawler with sitemap '+req.domain, err, numberAffected);
            } else {
                console.log('Updated crawler with sitemap '+req.domain, err, numberAffected);
            }
        });
    });

    return this;
}

