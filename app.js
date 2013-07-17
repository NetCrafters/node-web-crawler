/**
 * Module dependencies.
 */

var express    = require('express')
  , http       = require('http')
  , path       = require('path')
  , partials   = require('express-partials')
  , underscore = require('underscore')
  , config     = require('./config')
  , app        = express();

// set config by environment
if (process.env.ENVIRONMENT!='default') {
    app.config = underscore.extend(config.default, config[process.env.ENVIRONMENT]);
} else {
    app.config = config.default;
}

// setup socket io
global.io = require('socket.io').listen(app.listen( app.config.server.port ));
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

// load modules
for (var i in app.config.modules) {
    if (app.config.modules[i].enabled) {
        console.log('Load module '+i);
        require('./modules/'+i)(app, models);
    }
}

// route
require('./routes')(app, models);

