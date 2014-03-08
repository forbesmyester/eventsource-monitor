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

var SSEM = function(sseFactory) {
	this._sseFactory = sseFactory;
	this._connections = [];
	this._url = undefined;
	this._externalThinksConnected = false;
	this._externalWantsConnected = false;
};

SSEM.prototype._getActiveConnection = function() {
	return this._connections[this._connections.length - 1];
};

SSEM.prototype._isLast = function(conn) {
	if (conn !== this._connections[this._connections.length - 1].conn) {
		return false;
	}
	return true;
};

SSEM.prototype._addConnection = function() {
	var r = {
		conn: this._sseFactory(this._url),
		url: this._url,
		connected: false
	};
	r.conn.onopen = this._onopen.bind(this);
	r.conn.onerror = this._onerror.bind(this);
	r.conn.onmessage = this._onmessage.bind(this);
	this._connections.push(r);
	this._emit('added-managed-connection', r);
};

SSEM.prototype._inspectForUrlChange = function() {
	var event = 'url-changed-was-offline';
	
	var emit = function(event) {
		this._emit(event, {
			conn: this._getActiveConnection().conn,
			old_url: this._connections[0].url,
			url: this._getActiveConnection().url
		});
	}.bind(this);
	
	if (this._connections.length < 2) {
		return;
	}
	
	emit('url-changed');
	
	if (this._connections[0].connected) {
		event = 'url-changed-was-online';
	}
	
	emit(event);
};

SSEM.prototype._removeConnection = function(n) {
	var r = [];
	delete this._connections[n].conn;
	for (var i=0; i<this._connections.length; i++) {
		if (i !== n) {
			r.push(this._connections[i]);			
		} else {
			this._emit('removed-managed-connection', this._connections[i]);
		}
	}
	this._connections = r;
};

SSEM.prototype._purgeExcessConnections = function() {
	while(this._connections.length > 2) {
		this._removeConnection(0);
	}
};

SSEM.prototype._onopen = function(e) {
	
	(function(target, connections) {
		for (var i=0; i<connections.length; i++) {
			if (connections[i].conn === target) {
				connections[i].connected = true;
			}
		}
	}(e.currentTarget, this._connections));
	
	if (!this._isLast(e.currentTarget)) {
		return;
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
	
	this._getActiveConnection().connected = true;
};

SSEM.prototype._onerror = function(e) {
	
	(function(target, connections) {
		for (var i=0; i<connections.length; i++) {
			if (connections[i].conn === target) {
				connections[i].connected = false;
			}
		}
	}(e.currentTarget, this._connections));
	
	if (!this._isLast(e.currentTarget)) {
		return;
	}
	
	if (this._externalThinksConnected) {
		this._emit('disconnected', {
			conn: this._getActiveConnection().conn,
			url: this._getActiveConnection().url
		});
	}
	
	this._externalThinksConnected = false;
};

SSEM.prototype._onmessage = function(e) {
	if (
		(this._isLast(e.currentTarget) && this._externalThinksConnected) ||
		(this._connections[this._connections.length-1].connected === false)
	) {
		this._emit('messaged', JSON.parse(e.data));
	}
};

SSEM.prototype.connect = function(url) {
	this._url = url;
	this._externalWantsConnected = true;
	if (this._connections.length === 0) {
		this._addConnection();
	}
	if (!this._externalThinksConnected && this._getActiveConnection().connected) {
		this._emit(
			'connected',
			{conn: this._connections[0].conn, url: this._connections[0].url }
		);
	}
	
};

SSEM.prototype.disconnect = function() {
	if (this._externalThinksConnected) {
		this._emit(
			'disconnected',
			{conn: this._connections[0].conn, url: this._connections[0].url }
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
		}(url, this._connections));
	
	var connectionSort = function(a, b) {
			if ((a.url != url) && (b.url != url)) {
				return 0;
			}
			if (a.url === url) {
				return 1;
			}
			return -1;
		};
	
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
		this._addConnection();
	} else {	// if it is found (but not last) make it last and then see if it
				// should be seen as a change event.
		this._connections.sort(connectionSort);
		this._inspectForUrlChange();
		
	}

	this._purgeExcessConnections();	

};

addEvents(SSEM, [
	'added-managed-connection', 'removed-managed-connection', 'connected',
	'disconnected', 'messaged', 'url-change-started', 'url-changed',
	'url-changed-was-online', 'url-changed-was-offline'
]);

return SSEM;

}));