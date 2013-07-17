
module.exports = function (mongoose){

    this.schema = new mongoose.Schema({
        url: {
            type: String,
            index: { unique: true }
        },
        domain: String,
        table: String,
        sitemap: String,
        crawlConfig: String,
        lastCrawlDate: Date,
        modified: Date
    });

    this.model = mongoose.model('crawler', this.schema);

    this.model.getCrawler = function(url, callback) {
        this.find({url:url}).exec(function(err, data){
            if (typeof(callback)=='function') {
                callback(err, data[0]);
            }
        });
    }

    this.model.getCrawlers = function(callback) {
        this.find().sort({modified:'descending'}).exec(function(err, data){
            if (typeof(callback)=='function') {
                callback(err, data);
            }
        });
    }

    return this;
}

