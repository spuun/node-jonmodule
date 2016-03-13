module.exports = (parent) => {
	parent.on('ok', (data) => {
		parent.event('result',data);
	});
};
