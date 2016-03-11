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
	// The object that will be returned. This is the object the parent
	// is using to communicate with the module.
	var modObj = {}

	var state = States.None;
	var emitter = new eventemitter();
	var callbacks = {};
	var callbackCounter = 0;
	var modulep;
	log(filename, '- Loading module');

	// Special events that the parent will receive from its modules
	var events = {
		// When module is loaded, send init which contains parent API
		'__loaded': data => {
			log(data.filename, '- Module loaded');
			state = States.Loaded;
			modulep.send({
				event: '__init',
				data: {
					api: Object.keys(api)
				}
			});
		},	
		'__inited': data => {
			// Map modules api
		  data.api.forEach(function(methodName) {
				modObj[methodName] = function() {
					modulep.command(methodName, [...arguments]);
				}
			});		
			emitter.emit('loaded', data);
		},
		'__unloaded': data => {
			log(filename, '- Module unloaded');
			if (state != States.Reloading) {
				state = States.None;
			}
		},
		'__callback': data => {
			var id = data.callback;
			var args = data.args;
			if (callbacks.hasOwnProperty(id)) {
				callbacks[id].apply(modulep, args);
				delete callbacks[id];
			};
		},
		// default event will just result in an event
		'default': (event, data) => {
			modObj.emit(event, data);
		}
	};

	var handleModuleEvent = (event, data) => {
		if (!events.hasOwnProperty(event)) {
			return events.default(event, data);
		}
		return events[event](data);
	};
	var handleModuleCommand = (cmd, args) => {
		if (api.hasOwnProperty(cmd)) {
			api[cmd].apply(modObj, args);
		}
	};

	// Create child process with module.
	var createModuleProcess = () => {
		state = States.Loading;
		modulep = cp.fork(module.filename);
		modulep.on('exit', function(status) {
			emitter.emit('exit');
			// if the module exits and state is reloading it means that 
			// reload has been triggered. Create a new process.
			if (state == States.Reloading) {
				createModuleProcess();
			}
		});
		modulep.on('error', function(err) {
			emitter.emit('error', err);
		});
		modulep.on('message', function(msg) {
			if (msg.event)
				return handleModuleEvent(msg.event, msg.data);
			if (msg.command)
				return handleModuleCommand(msg.command, msg.args);
			log('Unhandled module message:', msg);
		});
		modulep.send({event:'__load', data:filename});
		modulep.command = (cmd, args) => {
			var data = {command: cmd, data: args};
			if (typeof args[args.length-1] == 'function') {
				data.callback='callback_' + callbackCounter++;
				callbacks[data.callback] = args.pop();
			}
			modulep.send(data);
		};
	};

	var emit = (event, data) => {
		modulep.send({event, data});
	}
	// Add some methods to module object. This is the API the parent has to work with.
	Object.assign(modObj, {
		unload: () => {
			modulep.send({event:'__unload', data:{}});
		},
		reload: () => {
			state = States.Reloading;
			modObj.unload();
		},
		on: emitter.on.bind(emitter),
		emit: emit,
		filename,
		name: path.basename(filename, '.js')
	});

	createModuleProcess();
	return modObj;
};
/*
	CHILD CODE
*/
var initmodule = () => {
	var parent = new eventemitter();
	var moduleInitializer, modInstance;

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
		'__load': filename => {			
			moduleInitializer = require(filename);
			parent.send('__loaded', {filename});
			parent.filename = filename;
		},
		'__init': data => {
			data.api.forEach(methodName => {
				parent[methodName] = function() {
					parent.command(methodName, [...arguments]);
				};
			});
			parent.log(parent.filename, '__init');
			// instantiate module and send api to parent
			modInstance = moduleInitializer(parent);
			var api = Object.keys(modInstance||{});
			parent.send('__inited', {api});
		},
		'__unload': data => {
			parent.emit('unload', {});
			parent.send('__unloaded', 'Module unloaded. Exiting process.');
			process.exit();
		}
	}

	var handleParentEvent = (event, data) => {
		if (!events.hasOwnProperty(event)) {
			return parent.emit(event, data);
		}
		return events[event](data);
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

var log = function() {
	if (!loadmodule.debug) return;
	var args = ['[CHILD PROC MODULE]', ...arguments];
	console.log(...args);
}

loadmodule.debug = false;

if (module.parent) {
	module.exports = loadmodule;
} else {
	initmodule();
}
