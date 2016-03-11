var assert = require('assert');
var path = require('path');
var modp = require('../');

var p = function(file) {
	return path.join(__dirname, file);
}


describe('jonmodule', () => {
	it('should call helloWorld', (done) => {
		var api = {
			helloWorld: () => {
				assert.ok(true);
				done();
			}
		}
		var module = modp(p('mod_helloworld.js'), api);
	});

	it('should echo data', (done) => {
		var testdata = "hello";
		
		var api = {
			echo: (data) => {
				assert.equal(testdata, data);
				done();
			}
		};
		
		var module = modp(p('mod_echo.js'), api);
		module.on('loaded', () => {
			module.echo(testdata);
		});
	});

	it('should reload', (done) => {
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
});

