module.exports = (parent) => {
	parent.on('loaded', () => {
		parent.helloWorld();
	});
	return {};
};
