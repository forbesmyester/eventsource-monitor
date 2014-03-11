(function (root, factory) { // UMD from https://github.com/umdjs/umd/blob/master/returnExports.js
	"use strict";
	if (typeof exports === 'object') {
		module.exports = factory(require('add-events'));
	} else if (typeof define === 'function' && define.amd) {
		define(['add-events/index'],factory);
	} else {
		root.EventSourceMonitor = factory(root.addEvents);
	}
}(this, function (addEvents) {

"use strict";

var SSEM = function(sseFactory, url) {
	this._sseFactory = sseFactory;
	this._connections = [];
	this._url = url;
	this._externalThinksConnected = false;
	this._externalWantsConnected = false;
};

SSEM.prototype._getActiveConnection = function() {
	return this._connections[this._getLastConnectedIndex()];
};

SSEM.prototype._addConnection = function() {
	var r = {
		conn: this._sseFactory(this._url),
		url: this._url
	};
	r.conn.onopen = this._onopen.bind(this);
	r.conn.onerror = this._onerror.bind(this);
	r.conn.onmessage = this._onmessage.bind(this);
	this._connections.push(r);
	this._emit('added-managed-connection', r);
};

SSEM.prototype._inspectForUrlChange = function() {
	
	var event = 'url-changed-was-offline',
		emitObj = {
				conn: this._getActiveConnection().conn,
				old_url: this._connections[0].url,
				url: this._getActiveConnection().url
			},
		connectedCount = 0;
	
	if (this._connections.length < 2) {
		return;
	}
	
	this._emit('url-changed', emitObj);
	
	for (var i=0; i<this._connections.length; i++) {
		if (this._connections[i].conn.readyState == 1) {
			connectedCount = connectedCount + 1;
		}
	}
	
	if (connectedCount > 1) {
		event = 'url-changed-was-online';
	}
	
	this._emit(event, emitObj);
};

SSEM.prototype._removeConnection = function(n) {
	var nc = [],
		r = false;
	this._connections[n].conn.close();
	for (var i=0; i<this._connections.length; i++) {
		if (i !== n) {
			nc.push(this._connections[i]);			
		} else {
			this._emit('removed-managed-connection', this._connections[i]);
			r = this._connections[i];
		}
	}
	this._connections = nc;
	return r;
};

SSEM.prototype._getLastConnectedIndex = function() {
	var i, lastConnectedIndex = -1;
	for (i=0; i<this._connections.length; i++) {
		if (this._connections[i].conn.readyState == 1) {
			lastConnectedIndex = i;
		}
	}
	return lastConnectedIndex;
};

SSEM.prototype._getConnectionIndex = function(conn) {
	for (var i=0; i<this._connections.length; i++) {
		if (this._connections[i].conn === conn) {
			return i;
		}
	}
	return -1;
};

SSEM.prototype._purgeExcessConnections = function() {
	var lastConnectedIndex = this._getLastConnectedIndex();
	if (lastConnectedIndex === -1) { return; }
	while(--lastConnectedIndex > -1) {
		this._removeConnection(0);
	}
};

SSEM.prototype._onopen = function(e) {
	
	if (e.currentTarget !== this._connections[this._connections.length - 1].conn) {
		return false;
	}
	
	this._inspectForUrlChange();
	this._purgeExcessConnections();
	
	if (
		!this._externalThinksConnected &&
		this._externalWantsConnected
	) {
		this._externalThinksConnected = true;
		this._emit('connected', {
			conn: this._getActiveConnection().conn,
			url: this._getActiveConnection().url
		});
	}
	
};

SSEM.prototype._onerror = function(e) {
	
	var c = this._connections[this._getConnectionIndex(e.currentTarget)];
	
	e.currentTarget.close();
	this._purgeExcessConnections();
	if (c.url != this._url) {
		return;
	}
	
	this._externalThinksConnected = false;
	
	this._emit('disconnected', {
		conn: c.conn,
		url: c.url
	});
	
};

SSEM.prototype._onmessage = function(e) {
	if (
		this._getConnectionIndex(e.currentTarget) == this._getLastConnectedIndex()
	) {
		this._emit('messaged', JSON.parse(e.data));
	}
};

/*
 * ## EventSourceMonitor.connect()
 *
 * Connect to the server.
 *
 */
SSEM.prototype.connect = function() {
	
	if (this._externalThinksConnected) { return; }
	while(this._connections.length) {
		this._removeConnection(0);
	}
	this._externalWantsConnected = true;
	this._addConnection();
	
};

SSEM.prototype.disconnect = function() {
	var oldConnObj = false;
	while(this._connections.length) {
		oldConnObj = this._removeConnection(0);
	}
	if (this._externalThinksConnected) {
		this._emit(
			'disconnected',
			{conn: oldConnObj.conn, url: oldConnObj.url }
		);
	}
	this._externalThinksConnected = false;
	this._externalWantsConnected = false;
};

SSEM.prototype.changeUrl = function(url) {
	
	var pos = (function(url, connections) {
				for (var i=0; i<connections.length; i++) {
					if (connections[i].url === url) { return i; }
				}
				return -1;
			}(url, this._connections)),
		connectionSort = function(a, b) {
				if ((a.url != url) && (b.url != url)) {
					return 0;
				}
				if (a.url === url) {
					return 1;
				}
				return -1;
			}
		;
	
	if (!this._connections.length) {
		this._url = url;
		if (this._externalWantsConnected) {
			this._addConnection();
		}
		return;
	}
	
	// If it is already the current, then just exit
	if (pos == this._connections.length-1) {
		return;
	}
	
	this._emit('url-change-started', {
		old_url: this._url,
		url: url
	});
	
	this._url = url;
	
	if (pos === -1) { // If it is not found just exit
		if (this._externalWantsConnected) {
			this._addConnection();
		}
	} else {	// if it is found (but not last) make it last and then see if it
				// should be seen as a change event.
		this._connections.sort(connectionSort);
		this._inspectForUrlChange();
		
	}

};

addEvents(SSEM, [
	'added-managed-connection', 'removed-managed-connection', 'connected',
	'disconnected', 'messaged', 'url-change-started', 'url-changed',
	'url-changed-was-online', 'url-changed-was-offline'
]);

return SSEM;

}));