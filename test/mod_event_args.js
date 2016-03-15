module.exports = (parent) => {
	parent.on('test', function(arg1, arg2) {
		parent.ok(arg1==arg2);
	});
	return {};
};
