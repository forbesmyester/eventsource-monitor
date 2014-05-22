!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),o.EventsourceMonitor=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
module.exports = (function (addEvents) {

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

}(_dereq_('add-events')));

},{"add-events":2}],2:[function(_dereq_,module,exports){
module.exports = (function () {
	
// Author: Matthew Forrester <matt_at_keyboardwritescode.com>
// Copyright: Matthew Forrester
// License: MIT/BSD-style

"use strict";

/**
 * # addEvents()
 *
 * Adds events to an existing pseudo-classical Javascript class.
 *
 * NOTE: Overwrites the following variables within the prototype:
 *
 * * _eventTypes
 * * _emit
 * * on
 * * once
 * * removeAllListeners
 * * removeAllOnceListeners
 * * removeOnceListener
 * * removeOnceListener
 *
 * NOTE: Overwrites the following variables within the instance of a class
 *
 * * _onceListeners
 * * _listeners
 * 
 * ## Example
 *
 * ```javascript
 * var MyClass = function() {
 * };
 *
 * MyClass.prototype.doSomething = function() {
 *	return this._emit('doneit','a','b');
 * };
 *
 * addEvents(MyClass,['doneit']);
 *
 * var myClass = new MyClass();
 * myClass.on('doneit',function (a, b) {
 *	console.log('a = ' + a + ', b = ' + b);
 * });
 * myClass.doSomething();
 * ```
 *
 * ## Parameters
 * * **@param {Function} `classFunc`** The class to add events to.
 * * **@param {Array} `events`** The events you want the class to support.
 */
var addEvents = function(classFunc, events) {

	classFunc.prototype._eventTypes = events;
	
	classFunc.prototype._emit = function(event /*, other arguments */) {

		var i = 0,
			args = Array.prototype.slice.call(arguments, 1);
		
		if (this._eventTypes.indexOf(event) === -1) {
			throw "SyncIt._emit(): Attempting to fire unknown event '" + event + "'";
		}
		
		var toFire = [];
		
		if (
			this.hasOwnProperty('_onceListeners') &&
			this._onceListeners.hasOwnProperty(event)
		) {
			while (this._onceListeners[event].length) {
				toFire.push(this._onceListeners[event].shift());
			}
		}
		
		if (
			this.hasOwnProperty('_listeners') &&
			this._listeners.hasOwnProperty(event)
		) {

			for (i=0; i<this._listeners[event].length; i++) {
				toFire.push(this._listeners[event][i]);
			}
		}
		
		while (toFire.length) {
			toFire.shift().apply(this, args);
		}
		
	};

	var pushTo = function(objKey, event, func, ctx) {
		
		if (ctx._eventTypes.indexOf(event) === -1) {
			throw "addEvents: Attempting to listen for unknown event '"+event+"'";
		}
		
		if (!ctx.hasOwnProperty(objKey)) {
			ctx[objKey] = {};
		}
		
		if (!ctx[objKey].hasOwnProperty(event)) {
			ctx[objKey][event] = [];
		}
		
		ctx[objKey][event].push(func);
	};

	/**
	 * ### CLASS.on()
	 * 
	 * Adds an event listeners to an event
	 * 
	 * #### Parameters
	 * 
	 * * **@param {String} `event`** The name of the event to listen for
	 * * **@param {Function} `listener`** The listener to fire when event occurs.
	 * 
	 * #### Returns
	 * 
	 * * **@return {Boolean}** True if that event is available to listen to.
	 */
	classFunc.prototype.on = function(event, func) {
		pushTo('_listeners', event, func, this);
	};
	classFunc.prototype.listen = classFunc.prototype.on;
	
	/**
	 * ### CLASS.once()
	 * 
	 * Adds an event listeners which will be called only once then removed
	 * 
	 * #### Parameters
	 * 
	 * * **@param {String} `event`** The name of the event to listen for
	 * * **@param {Function} `listener`** The listener to fire when event occurs.
	 * 
	 * #### Returns
	 * 
	 * * **@return {Boolean}** True if that event is available to listen to.
	 */
	classFunc.prototype.once = function(event,func) {
		pushTo('_onceListeners', event, func, this);
	};
	
	var removeAllListeners = function(objKey, event, ctx) {	
		var propertyNames = (function(ob) {
			var r = [];
			for (var k in ob) { if (ob.hasOwnProperty(k)) {
				r.push(k);
			} }
			return r;
		})(ctx[objKey]);
		
		if (propertyNames.indexOf(event) == -1) {
			return [];
		}
		
		var r = ctx[objKey][event];
		ctx[objKey][event] = [];
		return r;
	};

	/**
	 * ### CLASS.removeAllListeners()
	 *
	 * Removes all non `once` listeners for a specific event.
	 *
	 * #### Parameters
	 * 
	 * * **@param {String} `event`** The name of the event you want to remove all listeners for.
	 * 
	 * #### Returns
	 * 
	 * * **@return {Array}** The listeners that have just been removed.
	 */
	classFunc.prototype.removeAllListeners = function(event) {
		return removeAllListeners('_listeners', event, this);
	};
	
	/**
	 * ### CLASS.removeAllOnceListeners()
	 *
	 * Removes all `once` listeners for a specific event.
	 *
	 * #### Parameters
	 * 
	 * * **@param {String} `event`** The name of the event you want to remove all listeners for.
	 * 
	 * #### Returns
	 * 
	 * * **@return {Array}** The listeners that have just been removed.
	 */
	classFunc.prototype.removeAllOnceListeners = function(event) {
		return removeAllListeners('_onceListeners', event, this);
	};
	
	var removeListener = function(objKey, event, listener, ctx) {
		
		var i = 0,
			replacement = [],
			successful = false;
		
		var propertyNames = (function(ob) {
			var r = [];
			for (var k in ob) { if (ob.hasOwnProperty(k)) {
				r.push(k);
			} }
			return r;
		})(ctx[objKey]);
		
		if (propertyNames.indexOf(event) == -1) {
			return false;
		}
		
		for (i=0; i<ctx[objKey][event].length; i++) {
			if (ctx[objKey][event][i] !== listener) {
				replacement.push(ctx[objKey][event][i]);
			} else {
				successful = true;
			}
		}
		ctx[objKey][event] = replacement;
		
		return successful;
	};
	
	/**
	 * ### CLASS.removeListener()
	 *
	 * Removes a specific listener from an event (note, not from the `once()` call).
	 *
	 * #### Parameters
	 * 
	 * * **@param {String} `event`** The name of the event you want to remove a listener from.
	 * * **@param {Function} `listener`** The listener you want to remove.
	 * 
	 * #### Returns
	 * 
	 * * **@return {Boolean}** True if the listener was removed, false otherwise.
	 */
	classFunc.prototype.removeListener = function(event, listener) {
		return removeListener('_listeners', event, listener, this);
	};

	/**
	 * ### CLASS.removeOnceListener()
	 *
	 * Removes a specific listener from an event (note, not from the `once()` call).
	 *
	 * #### Parameters
	 * 
	 * * **@param {String} `event`** The name of the event you want to remove a listener from.
	 * * **@param {Function} `listener`** The listener you want to remove.
	 * 
	 * #### Returns
	 * 
	 * * **@return {Boolean}** True if the listener was removed, false otherwise.
	 */
	classFunc.prototype.removeOnceListener = function(event, listener) {
		return removeListener('_onceListeners', event, listener, this);
	};

};

return addEvents;

}());

},{}]},{},[1])
(1)
});