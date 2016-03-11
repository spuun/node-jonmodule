module.exports = (parent) => {
	parent.on('load', () => {
		parent.helloWorld();
	});
	return {};
};
