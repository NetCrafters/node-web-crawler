/**
 * $.parseParams - parse query string paramaters into an object.
 * source: https://gist.github.com/kares/956897
 */
(function($) {
var re = /([^&=]+)=?([^&]*)/g;
var decodeRE = /\+/g;  // Regex for replacing addition symbol with a space
var decode = function (str) {return decodeURIComponent( str.replace(decodeRE, " ") );};
$.parseParams = function(query) {
    var params = {}, e;
    while ( e = re.exec(query) ) { 
        var k = decode( e[1] ), v = decode( e[2] );
        if (k.substring(k.length - 2) === '[]') {
            k = k.substring(0, k.length - 2);
            (params[k] || (params[k] = [])).push(v);
        }
        else params[k] = v;
    }
    return params;
};
})(jQuery);

$(document).ready(function()
{
	$(document).on("click", "#toggle-create-crawler-options", toggleNewCrawlerOptions);
	$(document).on("click", ".pause-crawling", pauseCrawling);
	$(document).on("click", ".stop-crawling", stopCrawling);
	$(document).on("click", ".load-crawler", loadCrawler);
	$(document).on("click", ".delete-crawler", deleteCrawler);

	socket.on('general-stats', function (data)
	{
		var row_id = data.host.replace(/\./g,"");

		data.row_id = row_id;

		if (!$("#scraper-" + row_id).length)
			$("#active-scrapers-body").append(data.html)
		else
			$("#scraper-" + row_id + " .general-stats").html(data.stats_html);
	})

	socket.on('checking', function(data)
	{
		$("#checking-log").prepend("<a href='"+ data.url +"'>" + data.url + "</a>" + "<br/>");
	})

	socket.on('rps', function(data)
	{
		rpsChart.series[0].addPoint([(new Date()).getTime(), parseInt(data.rps)], true, true)
	})

	socket.on('got-404', function(data)
	{
		// $("#404").prepend(data.url + " [<a href='' target='_blank'>"+data.source+"</a>] <hr>");
	})

	socket.on('error', function(data)
	{
		var row_id = data.host.replace(/\./g,"");
		$("#scraper-" + row_id + " .crawling-status").html('<span class="label label-success">error</span>')		
	})

	socket.on('auth-required', function(data)
	{
		var row_id = data.host.replace(/\./g,"");

		if (!$("#scraper-" + row_id).length)
			$("#active-scrapers-body").append(data.html)
		
		$("#scraper-" + row_id + " .crawling-status").html('<span class="label label-important">bad auth</span>')		
	})

	socket.on('done-crawling', function(data)
	{
		var row_id = data.host.replace(/\./g,"");
		$("#scraper-" + row_id + " .crawling-status").html('<span class="label label-success">done</span>')
		$("#scraper-" + row_id + " .general-stats").html('');
	})

	socket.on('stop-crawling', function(data)
	{
		var row_id = data.host.replace(/\./g,"");
		$("#scraper-" + row_id + " .crawling-status").html('<span class="label label-important">stopped</span>')
		$("#scraper-" + row_id + " .general-stats").html('');
	})

	socket.on('sitemap-ready', function(data)
	{
		$("body").append("<a href='/"+ data.path +"'>Download sitemap</a>");
	})
})


function pauseCrawling() {
	socket.emit("pause-crawling", {host_id: $(this).data("host_id")})
}

function stopCrawling() {
	socket.emit("stop-crawling", {host_id: $(this).data("host_id")})
}

function toggleNewCrawlerOptions() {
	var toggler = $(this);
	 $('#create-crawler-options').slideToggle(function(){
	 	toggler.removeClass("collapsed expanded").addClass( ($(this).is(":visible")) ? "expanded" : "collapsed" );
	 });
}

function loadCrawler() {
    var config = $(this).data('config');
    var inputs = $('#config textarea, #config select, #config input');
    inputs.each(function(){
        for (var key in config) {
            if ($(this).prop('name')==key) {
                if ($(this).prop('type')=='checkbox' || $(this).prop('type')=='radio') {
                    if ($(this).prop('value')==config[key]) {
                        // make sure no others are checked
                        $('input[name="'+$(this).prop('name')+'"]').prop('checked', false);
                        // check this one (if it is truthy)
                        if (config[key]) {
                            $(this).prop('checked', true);
                        }
                    }
                } else {
                    $(this).val(config[key]);
                }
            }
        }
    });
}

function deleteCrawler(e) {
    e.preventDefault();
    // variables
    var form = $(this).closest('form');
	var message_div = $(this).closest('fieldset');
    var submit = $(this);
    var data = form.serialize();
    data += '&ajax=true';
    var config = $.parseParams(data);
    var url = config.url;
    // check if we are disabled
    if (submit.hasClass('disabled')) {
        return false;
    }
    submit.addClass('disabled');
    // xhr request
    $.ajax({
        url: form.prop('action'),
        method: form.prop('method'),
        data: data,
        dataType: 'json',
        error: function(xhr, code, message) {
            message_div.prepend('<div class="alert alert-error"><button type="button" class="close" data-dismiss="alert">&times;</button><strong>Error!</strong> '+message+'</div>');
            submit.removeClass('disabled');
        },
        success: function(response) {
            if (typeof(response.error)=='undefined') {
                message_div.prepend('<div class="alert alert-error"><button type="button" class="close" data-dismiss="alert">&times;</button><strong>Error!</strong> An unknown error occurred on the server!</div>');
                submit.removeClass('disabled');
            } else if (response.error) {
                message_div.prepend('<div class="alert alert-error"><button type="button" class="close" data-dismiss="alert">&times;</button><strong>Error!</strong> '+response.response+'</div>');
                submit.removeClass('disabled');
            } else {
                $('#crawlers-body tr').each(function(){
                    if ($(this).data('url')==url) {
                        $(this).remove();
                        return false;
                    }
                });
                message_div.prepend('<div class="alert alert-success"><button type="button" class="close" data-dismiss="alert">&times;</button><strong>Success!</strong> Your crawler was deleted!</div>');
                submit.removeClass('disabled');
            }
        }
    });
}

