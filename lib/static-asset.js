var path = require('path');
module.exports = staticAsset;
function staticAsset(rootPath, options) {
	options || (options = {});
	var _ref;
	if ((_ref = options.debug) == null)
		options.debug = false;
	if ((_ref = options.set_expires_headers) == null)
		options.set_expires_headers = true

	var labels = {},
		fingerprints = {}; //fingerprint -> headers
	if(options.strategy == null)
		options.strategy = staticAsset.strategies["default"];
	//Return Express middleware
	return function(req, res, next) {
		var info = fingerprints[req.url];
		//If this request matches a fingerprint
		if(info)
		{
			//Set headers
			for(var i in info)
				if (res.set)
					res.set(i, info[i]);
				else
					res.setHeader(i, info[i]);
			//Check If-Modified-Since and If-None-Match headers
			if((req.headers["if-none-match"] && info.ETag == req.headers["if-none-match"]) ||
				(req.headers["if-modified-since"] && info["Last-Modified"] ==
					req.headers["if-modified-since"]) )
				return res.send(304);
		}
		// Create global function that works from Jade
		if (!global.assetFingerprint)
			global.assetFingerprint = assetFingerprint;
		//If req.assetFingerprint is already there, do nothing.
		if(req.assetFingerprint)
			return next();
		//Create req.assetFingerprint
		req.assetFingerprint = assetFingerprint;
		//Expose req.assetFingerprint in Express helper
		res.locals.assetFingerprint = function() {
			return assetFingerprint.apply(req, arguments);
		};
		//Run next middleware
		next();
	};
	//Helper function that adds fingerprints and returns them
	function addFingerprint(fingerprint, headers) {
		fingerprints[fingerprint] = headers;
		if (options.debug === true)
			console.log("addFingerprint", fingerprint, ":", headers);
		return fingerprint;
	}
	//req.assetFingerprint function
	function assetFingerprint(label, fingerprint, cacheInfo) {
		if(arguments.length > 1)
		{
			//Add a label
			var labelInfo = labels[label] = {"fingerprint": fingerprint};
			for(var i in cacheInfo)
				labelInfo[i] = cacheInfo[i];
		}
		else
		{
			//Get a fingerprint
			var info = labels[label];
			if(info)
			{
				var headers = {};
				if(info.etag)
					headers["ETag"] = info.etag;
				if(info.lastModified)
					headers["Last-Modified"] = info.lastModified.toUTCString();
				if(info.expires !== null && options.set_expires_headers === true)
				{
					if(!info.expires)
					{
						var d = info.expires = new Date();
						d.setFullYear(d.getFullYear() + 1);
					}
					headers["Expires"] = info.expires.toUTCString();
					headers["Cache-Control"] = "public; max-age=" +
						Math.floor((info.expires.getTime() - new Date().getTime() ) / 1000);
				}
				return addFingerprint(info.fingerprint, headers);
			}
			else
			{
				var filename = path.resolve(rootPath + "/" + (label || this.url) );
				//Use the "cache options.strategy" to get a fingerprint
				//Prefer the use of etag over lastModified when generating
				//fingerprints
				var expires = options.strategy.expires ||
					staticAsset.strategies["default"].expires;
				expires = expires(filename);
				var headers = {};
				if (options.set_expires_headers === true) {
					headers["Expires"] = expires.toUTCString();
					headers["Cache-Control"] = "public; max-age=" +
						Math.floor((expires.getTime() - new Date().getTime() ) / 1000)
				}
				if(options.strategy.etag)
				{
					var etag = options.strategy.etag(filename);
					headers["ETag"] = etag;
					return addFingerprint(label + "?v=" + etag,	headers);
				}
				else if(options.strategy.lastModified)
				{
					var mdate = options.strategy.lastModified(filename);
					mdate.setMilliseconds(0);
					headers["Last-Modified"] = mdate.toUTCString();
					//Encode the Date as a radix 36 UTC timestamp
					mdate = new Number(mdate.getTime() / 1000).toString(36);
					return addFingerprint(label + "?v=" + mdate, headers);
				}
				else
					return label; //Do not generate a fingerprint
			}
		}
	}
};

//Expose cache strategies
staticAsset.strategies = require("./cache-strategies");