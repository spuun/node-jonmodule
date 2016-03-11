var assert = require('assert');
var path = require('path');
var modp = require('../lib/module.js');

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
			module.emit('echo', testdata);
		});

	});
});

