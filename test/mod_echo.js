module.exports = (parent) => {
	parent.on('echo', (data) => parent.echo(data));
}
