/**
 * Module dependencies.
 */

var express    = require('express')
  , http       = require('http')
  , path       = require('path')
  , partials   = require('express-partials')
  , app        = express();

// read config
app.config = require('./config');

// environment overrides
if (process.env.PORT) {
    app.config.port = process.env.PORT;
}
if (process.env.LOG_LEVEL) {
    app.config.log_level = process.env.LOG_LEVEL;
}
if (process.env.DB_SERVICE) {
    app.config.db.service = process.env.DB_SERVICE;
}
if (process.env.DB_HOST) {
    app.config.db.host = process.env.DB_HOST;
}
if (process.env.DB_DATABASE) {
    app.config.db.database = process.env.DB_DATABASE;
}

// setup socket io
global.io = require('socket.io').listen(app.listen( app.config.port ));
io.configure(function () {
	io.set('transports', ['websocket', 'xhr-polling']);
	io.set('log level', app.config.log_level);
	io.set('force new connection', true);
});
io.sockets.on('connection', function (socket) {
	socket.on('setMaxThreads', function(data){  });
});

// mongoose connect
app.mongoose = require('mongoose');
app.mongoose.connect(app.config.db.service+'://'+app.config.db.host+'/'+app.config.db.database);

// setup models
var models = {};
models.LinksGrabbedSchema = require('./models/linksgrabbed.js')(app.mongoose).schema;
if (app.config.modules.save_crawlers.enabled) {
    models.crawler = require('./models/crawler.js')(app.mongoose).model;
}

// configure app
app.configure(function() {
	app.set('views', __dirname + '/views');
	app.set('view engine', 'ejs');
	app.set('view options', { layout:true, pretty: true });
	app.use(express.favicon());
	app.use(express.logger('dev'));
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(partials());
	app.use(app.router);
	app.use(express.static(path.join(__dirname, 'public')));
});
app.configure('development', function(){
	app.use(express.errorHandler());
});

// route
require('./routes')(app, models);

