var fs 		= require('fs');
var cp 		= require('child_process');
var path	= require('path');
var eventemitter	= require('events');

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
	// The object that will be returned. This is the object the parent
	// is using to communicate with the module.
	var child = {}
	// parent emitter that triggers events in the main applikation
	// the main applikation is actually listening to child, but parent is
	// a better name in this context "between" child and parent
	var parent = new eventemitter();

	var state = States.None;
	var callbacks = {};
	var callbackCounter = 0;

	var modulep;
	
	var emit = (event, data) => {
		modulep.send({event, data});
	}
	// Add some methods to module object. This is the API the parent has to work with.
	Object.assign(child, {
		unload: () => {
			modulep.send({event:'__unload', data:{}});
		},
		reload: () => {
			state = States.Reloading;
			child.unload();
		},
		on: parent.on.bind(parent),
		emit: emit,
		filename,
		name: path.basename(filename, '.js')
	});

	parent.on('newListener', (event, listener) => {
		if (event == 'load' && state == States.Loaded) {
			listener(child);
		}
	});

	// Special events that the parent will receive from its modules
	var events = {
		'__loaded': data => {
			data.api.forEach(function(methodName) {
				child[methodName] = function() {
					var args = [...arguments]
					var data = {command: methodName, data: args};
					if (typeof args[args.length-1] == 'function') {
						data.callback='callback_' + callbackCounter++;
						callbacks[data.callback] = args.pop();
					}
					modulep.send(data);
				}
			});		
			state = States.Loaded;
			parent.emit('load', child);
		},
		'__unloaded': data => {
			if (state != States.Reloading) {
				state = States.None;
			}
		},
		'__callback': data => {
			var id = data.callback;
			var args = data.args || [];
			if (callbacks.hasOwnProperty(id)) {
				callbacks[id].apply(modulep, args);
				delete callbacks[id];
			};
		},
		// default event will just result in an event for the main applikation to handle
		'default': (event, data) => {
			parent.emit(event, data);
		}
	};

	var handleModuleEvent = (event, data) => {
		if (!events.hasOwnProperty(event)) {
			events.default(event, data);
		} else {
			return events[event](data);
		}
	};
	var handleModuleCommand = (cmd, args) => {
		if (api.hasOwnProperty(cmd)) {
			api[cmd].apply(child, args);
		}
	};

	// Create child process with module.
	var createModuleProcess = () => {
		state = States.Loading;
		modulep = cp.fork(module.filename);
		modulep.on('exit', function(status) {
			parent.emit('exit');
			// if the module exits and state is reloading it means that 
			// reload has been triggered. Create a new process.
			if (state == States.Reloading) {
				createModuleProcess();
			}
		});
		modulep.on('error', function(err) {
			parent.emit('error', err);
		});
		modulep.on('message', function(msg) {
			if (msg.event) {
				handleModuleEvent(msg.event, msg.data);
			} else if (msg.command) {
				return handleModuleCommand(msg.command, msg.args);
			}
		});
		modulep.command = (cmd, args) => {
			var data = {command: cmd, data: args};
			if (typeof args[args.length-1] == 'function') {
				data.callback='callback_' + callbackCounter++;
				callbacks[data.callback] = args.pop();
			}
			modulep.send(data);
		};
		modulep.send({event:'__load', data:{ filename, api:Object.keys(api) }});
	};

	createModuleProcess();
	return child;
};
/*
	 CHILD CODE
*/
var initmodule = () => {
	var parent = new eventemitter();
	var modInstance;

	Object.assign(parent, {
		send: (event, data) => { 
			process.send({event, data});
		},
		command: (command, args) => {
			process.send({command, args});
		},
		log: (filename, message) => {
			process.send({command: 'log', args: [filename, message]});
		}
	});

	var events = {
		'__load': data => {			
			var moduleInitializer = require(data.filename);
			parent.filename = data.filename;
			data.api.forEach(methodName => {
				parent[methodName] = function() {
					parent.command(methodName, [...arguments]);
				};
			});
			modInstance = moduleInitializer(parent);
			var api = Object.keys(modInstance||{});
			parent.send('__loaded', {filename: data.filename, api});
			parent.emit('load');
		},
		'__unload': data => {
			parent.emit('unload', {});
			parent.send('__unloaded', 'Module unloaded. Exiting process.');
			process.exit();
		}
	}

	var handleParentEvent = (event, data) => {
		if (!events.hasOwnProperty(event)) {
			parent.emit(event, data);
		} else {
			events[event](data);
		}
	};

	var handleParentCommand = (command, data, callback) => {
		if (modInstance.hasOwnProperty(command)) {
			if (callback) {
				data.push(function() {
					parent.send('__callback', {callback, args:[...arguments]});							
				});
			} 
			modInstance[command].apply(modInstance, data);
		}
	};

	process.on('message', (msg) => {
		if (msg.event) {
			handleParentEvent(msg.event, msg.data);
		}
		if (msg.command) {
			handleParentCommand(msg.command, msg.data, msg.callback);
		}
	});
};

if (module.parent) {
	module.exports = loadmodule;
} else {
	initmodule();
}
