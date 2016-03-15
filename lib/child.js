var eventemitter	= require('events');
var validate = require('./validation');
var toArr = (args) => {
	var ret = [];
	for (var i=0;i<args.length;++i) {
		ret[i] = args[i];
	}
	return ret;
};
/*
	 CHILD CODE
*/
var initmodule = () => {
	var parentEmitter = new eventemitter();
	var parent; 
	var modInstance;

	var app = {
		sendEvent: (event, args) => {
			process.send({event, args});
		},
		sendCommand: (command, args) => {
			var data = {command, args};
			process.send(data);
		},
		handleEvent: (event, data) => {
			if (!events.hasOwnProperty(event)) {
				parentEmitter.emit(event, ...data);
			} else {
				events[event](...data);
			}
		},
		handleCommand: (command, data, callback) => {
			if (modInstance.hasOwnProperty(command)) {
				if (callback) {
					data.push(function() {
						app.sendEvent('__callback', [callback, toArr(arguments)]);
					});
				} 
				modInstance[command](...data);
			}
		}
	}

	parent = {
		on: parentEmitter.on.bind(parentEmitter),
		event: function(event) {
			app.sendEvent(event, toArr(arguments).slice(1));
		}
	};

	var events = {
		'__load': (filename, api) => {			
			var moduleInitializer = require(filename);
			parent.filename = filename;
			api.forEach(methodName => {
				parent[methodName] = function() {
					app.sendCommand(methodName, toArr(arguments));
				};
			});
			modInstance = moduleInitializer(parent);
			var apiMethods = Object.keys(modInstance || {});
			try {
				validate.api(apiMethods);
			} catch (err) { 
				app.sendEvent('error', [err.message]);
				return;
			}
			app.sendEvent('__loaded', [filename, apiMethods]);
			parentEmitter.emit('loaded');
		},
		'__unload': data => {
			parentEmitter.emit('unload', {});
			app.sendEvent('__unloaded', ['Module unloaded. Exiting process.']);
			process.exit();
		}
	}

	process.on('message', (msg) => {
		if (msg.event) {
			app.handleEvent(msg.event, msg.args);
		}
		if (msg.command) {
			app.handleCommand(msg.command, msg.args, msg.callback);
		}
	});
};
initmodule();
