module.exports = (parent) => {
	return {
		echo: (data) => parent.echo(data)
	}
}
