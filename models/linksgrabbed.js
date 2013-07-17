
module.exports = function (mongoose){

    this.schema = new mongoose.Schema({
        url: {
            type: String,
            index: { unique: true }
        },
        source: String,
        content_type: String,
        http_status: Number,
        depth_level: Number
    });

    return this;
}

