/*jshint smarttabs:true */
(function (root, factory) {

	"use strict";

	if (typeof exports === 'object') {
		// Node. Does not work with strict CommonJS, but
		// only CommonJS-like enviroments that support module.exports,
		// like Node.
		module.exports = factory(
			require('../node_modules/expect.js/expect.js'),
			require('../index.js')
		);
	} else if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(
			[
				'expect.js',
				'../index'
			],
			factory
		);
	} else {
		// Browser globals (root is window)
		root.returnExports = factory(
			root.expect,
			root.EventSourceMonitor
		);
	}
}(this, function (
	expect,
	EventSourceMonitor
) {
// =============================================================================

"use strict";

describe('EventSourceMonitor',function() {
	
	var FakeEventSource = function(url) {
		this._url = url;
		this.readyState = 0;
	};
	
	FakeEventSource.prototype.open = function() {
		this.readyState = 1;
		this.onopen({currentTarget: this});
	};
	
	FakeEventSource.prototype.close = function() {
		this.readyState = 2;
	};
	
	FakeEventSource.prototype.pretendDisconnected = function() {
		this.readyState = 2;
		this.onerror({currentTarget: this});
	};
	
	FakeEventSource.prototype.pretendMessage = function(msg) {
		this.readyState = 1;
		this.onmessage({
			currentTarget: this,
			data: JSON.stringify(msg)
		});
	};
	
	var eventSources = [];
	
	var eventSourceFactory = function(url) {
		eventSources.unshift(new FakeEventSource(url));
		return eventSources[0];
	};
	
	it('can change url before connection', function(done) {
		var eventSourceMonitor = new EventSourceMonitor(eventSourceFactory);
		eventSourceMonitor.on('added-managed-connection', function(evt) {
			setTimeout(function() {
				evt.conn.open();
			},10);
		});
		eventSourceMonitor.on('connected', function(evt) {
			expect(evt.url).to.equal('two');
			done();
		});
		eventSourceMonitor.changeUrl('two');
		eventSourceMonitor.connect();
	});
	it('can connect, disconnect and connect again, firing events', function(done) {
		var completed = [];
		var eventSourceMonitor = new EventSourceMonitor(eventSourceFactory, 'one');
		eventSourceMonitor.on('added-managed-connection', function(evt) {
			evt.conn.open();
		});
		eventSourceMonitor.once('connected', function(evt) {
			completed.push('connected-event');
			expect(evt.url).to.equal('one');
			eventSources[0].pretendDisconnected();
		});
		eventSourceMonitor.once('disconnected', function(evt) {
			completed.push('disconnected-event');
			expect(evt.url).to.equal('one');
			eventSourceMonitor.once('connected', function() {
				completed.push('reconnected');
				expect(evt.url).to.equal('one');
				expect(completed).to.eql([
					'connected-event',
					'disconnected-event',
					'reconnected'
				]);
				done();
			});
			eventSourceMonitor.connect();
			
		});
		eventSourceMonitor.connect();
	});
	
	it('can be requested to disconnect', function(done) {
		var completed = [];
		var eventSourceMonitor = new EventSourceMonitor(eventSourceFactory, 'one');
		eventSourceMonitor.on('added-managed-connection', function() {
			completed.push('added-managed-connection');
		});
		eventSourceMonitor.on('connected', function(evt) {
			completed.push('connected-event');
			expect(evt.url).to.equal('one');
			eventSourceMonitor.disconnect();
		});
		eventSourceMonitor.on('disconnected', function(evt) {
			completed.push('disconnected-event');
			expect(evt.url).to.equal('one');
			expect(completed).to.eql([
				'added-managed-connection',
				'connected-event',
				'disconnected-event'
			]);
			done();
		});
		eventSourceMonitor.connect();
		eventSources[0].open();
	});
	
	it('can change urls, and change urls back (open before change)', function(done) {
		var completed = [];
		var eventSourceMonitor = new EventSourceMonitor(eventSourceFactory, 'one');
		eventSourceMonitor.on('added-managed-connection', function(evt) {
			completed.push('added-managed-connection');
			evt.conn.open();
		});
		eventSourceMonitor.on('removed-managed-connection', function() {
			completed.push('removed-managed-connection');
		});
		eventSourceMonitor.on('connected', function(evt) {
			completed.push('connected-event');
			expect(evt.url).to.equal('one');
			eventSourceMonitor.changeUrl('two');
		});
		eventSourceMonitor.once('url-changed-was-online', function(evt) {
			completed.push('url-changed');
			expect(evt.url).to.equal('two');
			expect(evt.old_url).to.equal('one');
			expect(completed).to.eql([
				'added-managed-connection',
				'connected-event',
				'added-managed-connection',
				'url-changed'
			]);
			eventSourceMonitor.on('url-changed-was-online', function(evt) {
				completed.push('url-changed');
				expect(evt.url).to.equal('one');
				expect(evt.old_url).to.equal('two');
				expect(completed).to.eql([
					'added-managed-connection',
					'connected-event',
					'added-managed-connection',
					'url-changed',
					'url-changed'
				]);
				done();
			});
			eventSourceMonitor.changeUrl('one');
		});
		eventSourceMonitor.connect();
	});

	it('can change urls, and change urls back (open after change)', function(done) {
		var completed = [];
		var eventSourceMonitor = new EventSourceMonitor(eventSourceFactory, 'one');
		eventSourceMonitor.on('added-managed-connection', function() {
			completed.push('added-managed-connection');
		});
		eventSourceMonitor.on('removed-managed-connection', function() {
			completed.push('removed-managed-connection');
		});
		eventSourceMonitor.on('connected', function(evt) {
			completed.push('connected-event');
			expect(evt.url).to.equal('one');
			eventSourceMonitor.changeUrl('two');
			eventSourceMonitor.changeUrl('one');
			done();
		});
		eventSourceMonitor.once('url-changed-was-online', function() {
			expect().fail();
		});
		eventSourceMonitor.connect();
		eventSources[0].open('one');
	});

	it('can route messages (one connection)', function(done) {
		var eventSourceMonitor = new EventSourceMonitor(eventSourceFactory, 'one');
		eventSourceMonitor.on('added-managed-connection', function(evt) {
			evt.conn.open();
		});
		eventSourceMonitor.on('connected', function(evt) {
			expect(evt.url).to.equal('one');
			eventSources[0].pretendMessage({m: 'one'});
		});
		eventSourceMonitor.on('messaged', function(data) {
			expect(data.m).to.equal('one');
			done();
		});
		eventSourceMonitor.connect();
	});
	
	it('will only route messages from the current', function(done) {
		var eventSourceMonitor = new EventSourceMonitor(eventSourceFactory, 'one');
		eventSourceMonitor.on('added-managed-connection', function(evt) {
			evt.conn.open();
		});
		eventSourceMonitor.on('connected', function(evt) {
			expect(evt.url).to.equal('one');
			eventSourceMonitor.changeUrl('two');
			eventSources[1].pretendMessage({m: 'one'});
			eventSources[0].pretendMessage({m: 'two'});
		});
		eventSourceMonitor.on('messaged', function(data) {
			expect(data.m).to.equal('two');
			done();
		});
		eventSourceMonitor.connect();
	});
	
	it('will still route messages from first connection if waiting for the second connection', function(done) {
		var eventSourceMonitor = new EventSourceMonitor(eventSourceFactory, 'one');
		var i = 0;
		eventSourceMonitor.on('added-managed-connection', function(evt) {
			if (i++ === 0) {
				evt.conn.open();
			}
		});
		eventSourceMonitor.on('connected', function(evt) {
			expect(evt.url).to.equal('one');
			eventSourceMonitor.changeUrl('two');
			eventSources[1].pretendMessage({m: 'one'});
		});
		eventSourceMonitor.on('messaged', function(data) {
			expect(data.m).to.equal('one');
			done();
		});
		eventSourceMonitor.connect();
	});
	
});

}));
