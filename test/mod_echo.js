module.exports = (parent) => {
	return {
		echo: (data, cb) => {
			console.log('child echo', data, cb);
			cb(data)
		}
	}
}
