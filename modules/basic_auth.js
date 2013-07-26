module.exports = function(app, models, modules) {
    this.module = {};

    // allow config to be public
    this.module.config = app.config.modules.basic_auth;

    // load our module
    this.module.load = function() {
        // build regex objects
        this.config.allow_regex = [];
        for (var i in this.config.allow) {
            this.config.allow_regex[i] = new RegExp(this.config.allow[i], "g");
        }
        this.config.deny_regex = [];
        for (var i in this.config.deny) {
            this.config.deny_regex[i] = new RegExp(this.config.deny[i], "g");
        }
    }

    // create an error message
    this.module.error = function(code, msg){
        var err = new Error(msg || http.STATUS_CODES[code]);
        err.status = code;
        return err;
    }

    // check a username and password to see if it is correct
    this.module.checkAuthorization = function(username, password) {
        if (this.config.username===false && this.config.password===false) {
            // require a username and password, but consider all usernames and
            // passwords as valid
            return true;
        } else {
            return (username===this.config.username && password===this.config.password);
        }
    }

    // send an unauthorized response
    this.module.unauthorized = function(res, realm) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Basic realm="' + realm + '"');
        res.end('Unauthorized');
    };

    /**
     * Return true if authorization is required.
     *
     * Reference: http://httpd.apache.org/docs/2.2/mod/mod_authz_host.html#order
     */
    this.module.authorizationRequired = function(req) {
        var auth = null;
        var allow = this.config.allow_regex;
        var deny = this.config.deny_regex;
        // first pass
        if (this.config.order[0]=='allow') {
            // start with allow
            for (var i in allow) {
                if (req.url.match(allow[i])!==null) {
                    auth = false;
                    break;
                }
            }
        } else {
            // start with deny
            for (var i in deny) {
                if (req.url.match(deny[i])!==null) {
                    auth = true;
                    break;
                }
            }
        }
        // second pass
        if (this.config.order[0]=='deny') {
            // now, allow
            for (var i in allow) {
                if (req.url.match(allow[i])!==null) {
                    auth = false;
                    break;
                }
            }
        } else {
            // now, deny
            for (var i in deny) {
                if (req.url.match(deny[i])!==null) {
                    auth = true;
                    break;
                }
            }
        }
        // third pass: we didn't match either, so use second directive
        if (auth==null) {
            auth = (this.config.order[1]=='allow') ? false : true;
        }
        return auth;
    }

    /**
     * Check basic auth. Will set the user to req.user and req.remoteUser.
     */
    app.all('*', function(req, res, next) {
        var authorization = req.headers.authorization;
        var realm = modules.basic_auth.config.realm;

        // if we already have a user, then assume it is correct and accept
        if (req.user) {
            return next();
        }

        // check if we need authorization
        if (!modules.basic_auth.authorizationRequired(req)) {
            return next();
        }

        // if we have no authorization, check if we need to send authorization
        if (!authorization) {
            return modules.basic_auth.unauthorized(res, realm);
        }

        // get basic auth info
        var parts = authorization.split(' ');
        if (parts.length !== 2) {
            return next(res.send(400));
        }
        var scheme        = parts[0]
            , credentials = new Buffer(parts[1], 'base64').toString()
            , index       = credentials.indexOf(':');

        // if not basic auth, then say we don't understand and send an error
        if ('Basic' != scheme || index < 0) {
            return next(modules.basic_auth.error(400));
        }

        // check if user is authorized
        var user = credentials.slice(0, index)
          , pass = credentials.slice(index + 1);
        if (modules.basic_auth.checkAuthorization(user, pass)) {
            req.user = req.remoteUser = user;
            next();
        } else {
            modules.basic_auth.unauthorized(res, realm);
        }
    });

    return this;
}

