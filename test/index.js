var assert = require('assert');
var path = require('path');
var modp = require('../');

var p = function(file) {
	return path.join(__dirname, file);
}


describe('jonmodule', () => {
	it('child should call api method helloWorld', done => {
		var api = {
			helloWorld: () => {
				assert.ok(true);
				done();
			}
		}
		var module = modp(p('mod_helloworld.js'), api);
	});
	it('should echo data via callback', done => {
		var testdata = "hello";
		var module = modp(p('mod_echo.js'));
		module.on('load',(module) => {
			module.echo(testdata, function(resultdata) {
				assert.equal(resultdata, testdata);
				done();	
			});
		});
	});
	it('should reload on reload() call', done => {
		var counter = 0;
		var unloaded = false;
		var api = { 
			helloWorld: () => {
				counter++;
				if (counter == 1) {
					module.reload();
				}
				if (counter == 2) {
					assert.ok(true);
					done();
				}
			}
		};
		var module = modp(p('mod_helloworld.js'), api);
	});
	it('events are sent in both directions', done => {
		var module = modp(p('mod_receive_event.js'), {});
		module.on('result', data => {
			assert.equal(data,'test');
			done();	
		}).on('load', (mod) => {
			mod.event('ok','test');
		});
	});
	it('module should trigger error event about invalid api', done => {
		var module = modp(p('mod_invalid_api.js'));
		module.on('error', msg => {
			assert.equal(msg, '\'on\' is a reserved name');
			done();
		});
	});
	it('app has invalid api methods', () => {
		assert.throws(
				() =>  modp(p('mod_helloworld.js'), {helloWorld: () => {}, event: () => {}}),
				Error);
	});
	it('event with multiple arguments sent', (done) => {
		var api = {
			ok: function(result) {
				assert.ok(result);
				done();
			}
		};
		var module = modp(p('mod_event_args.js'), api);
		module.on('load', () => {
			module.event('test', 'a', 'a');
		});
	});
});

