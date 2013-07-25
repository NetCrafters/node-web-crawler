/*
 * Routes handlers
 */

var exec = require('child_process').exec,
	child_process = require('child_process'),
    util          = require('util'),
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
        res.render('index', {
            port: app.config.port,
            modules: app.config.modules
        });
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

        // validate url
        var matches = url.match('https?://([^/]*)/?.*');
        if (!matches) {
            util.log('Invalid url given: '+url);
            res.redirect("/");
            return;
        } else {
            var domain = matches[1];
            req.domain = domain;
        }

        // fire add crawler event
        app.emit('add_crawler', req, res);

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
                    req.sitemap_path = sitemap_path;
                    fs.writeFile(sitemap_path, data.content, function(err) {
                        if (err) {
                            console.log(err);
                        } else {
                            io.sockets.emit('sitemap-ready', {path: sitemap_path.replace("public/", "")})
                            // update crawler sitemap
                            app.emit('add_crawler:sitemap-ready', req, res);
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

}

