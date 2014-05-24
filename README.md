# eventsource-monitor

Monitors and manages up to two EventSource, to give you the ability to smoothly change URL's, still recieving messages from the first while the second is coming online while also giving you many useful events which fire when things change (disconnections, url change complete etc).

## Usage

First you will need to define a factory method which will be used for creating EventSource instances. The input for this function can be anything you wish:

	var eventSourceFactory = function(url) {
		return new EventSource(url);
	};

Now we have our EventSource factory we can use it to create our EventSourceMonitor:

	var eventSourceMonitor = new EventSourceMonitor(
		eventSourceFactory,
		'http://yourdomain.com/eventsource?datasets[]=ds21&datasets[]=46'
	);

EventSource has a good few events which it can fire to tell you what is happening with your connection(s). Two of the most helpful are the "connected" and "disconnected":

	eventSourceMonitor.on('connected', function(evt) {
		console.log('Uh Oh, you seem to be disconnected...');
	});
	eventSourceMonitor.on('connected', function(evt) {
		console.log('I am connected to ' + evt.url);
	});

	eventSourceMonitor.connect();

Where EventSourceMonitor monitor becomes useful that it will manage changing of the URL you are connected to, note that EventSourceMonitor will continue to route events from the existing connection until the new connection is established.

	eventSourceMonitor.on('url-changed-was-online', function(evt) {
		console.log("The URL we are listening to events on has been changed to " + evt.url);
	});
	eventSourceMonitor.changeUrl(
		'http://yourdomain.com/eventsource?datasets[]=ds21&datasets[]=46&datasets[]=94'
	);

Either by request, or because of the internet / server you can become disconnected, in which case you will be notified of it:

	eventSourceMonitor.on('disconnected', function(evt) {
		console.log("You have been disconnected");
	});
	eventSourceMonitor.disconnect();

You can also change urls when you are disconnected:

	eventSourceMonitor.on('url-changed-was-offline', function(evt) {
		console.log(
			"Even though you are offline the URL we are listening to " +
			"events on has been changed to '" + evt.url + "
		);
	});
	eventSourceMonitor.changeUrl(
		'http://yourdomain.com/eventsource?datasets[]=ds21&datasets[]=46&datasets[]=94'
	);

If you want to reconnect!

	eventSourceMonitor.connect();

## Source Code

Source code is prepared using [Browserify](http://browserify.org/) which is also compatible with Node.JS. There is a UMD bundle which can be used with AMD or a vanilla browser (where it will export a global called called EventsourceMonitor.
