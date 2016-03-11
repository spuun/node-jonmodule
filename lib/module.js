var fs 		= require('fs');
var cp 		= require('child_process');
var path	= require('path');
var eventemitter	= require('events');

var argsToArray = function(args) {
	var ret = [];
	for (var i=0;i<args.length;++i)
		ret.push(args[i]);
	return ret;
};

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
	var modulep;
	log(filename, '- Loading module');

	// Special events that the parent will receive from its modules
	var events = {
		// When module is loaded, send init which contains parent API
		'__loaded': data => {
			log(filename, '- Module loaded');
			state = States.Loaded;
			modulep.send({
				event: '__init',
				data: {
					api: Object.keys(api)
				}
			});
		},	
		'__inited': data => {
			emitter.emit('loaded', data);
		},
		'__unloaded': data => {
			log(filename, '- Module unloaded');
			if (state != States.Reloading) {
				state = States.None;
			}
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
	var mod = new eventemitter();
	var moduleInitializer;

	Object.assign(mod, {
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
			moduleInitializer = require(data);
			mod.filename = data;
			mod.send('__loaded', data);
		},
		'__init': data => {
			data.api.forEach(methodName => {
				mod[methodName] = function() {
					mod.command(methodName, argsToArray(arguments));
				};
			});
			mod.log(mod.filename, '__init');
			moduleInitializer(mod);
			mod.send('__inited', {});
		},
		'__unload': data => {
			mod.emit('unload', {});
			mod.send('__unloaded', 'Module unloaded. Exiting process.');
			process.exit();
		}
	}

	var handleParentEvent = (event, data) => {
		if (!events[event])
			return mod.emit(event, data);
		return events[event](data);
	};

	process.on('message', (msg) => {
		if (msg.event) {
			handleParentEvent(msg.event, msg.data);
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
