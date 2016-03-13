var reservedApiMethods = ['unload','reload','on','event','meta'];
	
module.exports = {
	api: apiMethods => {
		apiMethods.forEach(method => {
			if (reservedApiMethods.indexOf(method) > -1) {
				throw new Error(`'${method}' is a reserved name`);
			}
		});	
	}
}
