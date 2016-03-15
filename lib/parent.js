var fs 		= require('fs');
var cp 		= require('child_process');
var path	= require('path');
var eventemitter	= require('events');
var validate = require('./validation');

var toArr = function(args) {
	var ret =[];
	for (var i=0;i<args.length;i++) {
		ret[i] = args[i];
	}
	return ret;
}

var States = {
	None: 0,
	Loading: 1,
	Loaded: 2,
	Reloading: 3
};

/*
	 PARENT CODE
	 */
var loadmodule = (filename, api) => {
	if (!fs.existsSync(filename)) {
		throw 'Can\'t find module ' + filename;
	};
	api = api||{};
	var apiMethods = Object.keys(api);
	validate.api(apiMethods);

	// The object that will be returned. This is the object the parent
	// is using to communicate with the module.
	var child;
	// events emitted on this emitter is events that the parent (main applikation) is
	// listening for
	var childEmitter = new eventemitter();

	var state = States.None;
	var callbacks = {};
	var callbackCounter = 0;
	var modulep;

	var sendQueue = [];

	var send = function(data) {
		if (!modulep) {
			return sendQueue.push(data);
		}
		modulep.send(data);
	};

	var module = {
		sendEvent: function(event) {
			var data = {event, args:toArr(arguments).slice(1)};
			send(data);
		},
		sendCommand: (cmd, args) => {
			var data = {command: cmd, args: args};
			if (typeof args[args.length-1] == 'function') {
				data.callback='callback_' + callbackCounter++;
				callbacks[data.callback] = args.pop();
			}
			send(data);
		},
		handleEvent: (event, data) => {
			if (!events.hasOwnProperty(event)) {
				events.default(event, ...data);
			} else {
				events[event](...data);
			}
		},
		handleCommand: (cmd, args) => {
			if (api.hasOwnProperty(cmd)) {
				api[cmd](...args);
			}
		}
	}
	// Add some methods to module object. This is the API the parent has to work with.
	child = {
		unload: () => {
			module.sendEvent('__unload');
		},
		reload: () => {
			state = States.Reloading;
			child.unload();
		},
		on: childEmitter.on.bind(childEmitter),
		event: module.sendEvent,
		meta: {
			filename,
			name: path.basename(filename, '.js')
		},
	};

	// if module already is loaded when someone registers to the load event we
	// trigger the event for that one
	childEmitter.on('newListener', (event, listener) => {
		if (event == 'load' && state == States.Loaded) {
			listener(child);
		}
	});

	// Special events that the parent will receive from its modules
	var events = {
		'__loaded': (filename, api) => {
			api.forEach(methodName => {
				child[methodName] = function() {
					module.sendCommand(methodName, toArr(arguments));
				}
			});		
			state = States.Loaded;
			childEmitter.emit('load', child);
			while (sendQueue.length > 0) {
				send(sendQueue.shift());
			}
		},
		'__unloaded': data => {
			if (state != States.Reloading) {
				state = States.None;
			}
		},
		'__callback': (callbackId, args) => {
			args = args || [];
			if (callbacks.hasOwnProperty(callbackId)) {
				callbacks[callbackId](...args);
				delete callbacks[callbackId];
			};
		},
		// default event will just result in an event for the main applikation to handle
		'default': (event, data) => {
			childEmitter.emit(event, data);
		}
	};


	// Create child process with module.
	var createModuleProcess = () => {
		state = States.Loading;
		modulep = cp.fork(path.join(__dirname, 'child.js'));
		modulep.on('exit', status => {
			childEmitter.emit('exit');
			// if the module exits and state is reloading it means that 
			// reload has been triggered. Create a new process.
			if (state == States.Reloading) {
				createModuleProcess();
			}
		});
		modulep.on('error', err => {
			childEmitter.emit('error', err);
		});
		modulep.on('message', msg => {
			if (msg.event) {
				module.handleEvent(msg.event, msg.args);
			} else if (msg.command) {
				module.handleCommand(msg.command, msg.args);
			}
		});
		module.sendEvent('__load', filename, apiMethods);
	};

	setImmediate(createModuleProcess);
	return child;
};

module.exports = loadmodule;
