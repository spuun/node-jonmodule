if (module.parent) {
	module.exports = require('./parent.js');
} else {
	require('./child.js');
}
