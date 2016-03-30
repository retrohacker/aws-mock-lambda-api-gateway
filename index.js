var http = require('http')
var url = require('url')

// Exporting the init function makes this nice and testable, while affording
// consumers of this module control over the server. The opts structure and
// callback are described in the README.md file
module.exports.init = function init (opts, cb) {
  /* Begin scrubbing input */
  // If options is a function and we aren't passed a callback, then assume that
  // opts is our callback and a mistake was made
  if (typeof opts === 'function') {
    return opts(new Error('`opts` object required'))
  }

  if (typeof opts !== 'object') {
    return cb(new Error('`opts` must be an object'))
  }

  if (!opts.listen) {
    return cb(new Error('`listen` is required'))
  }

  // Make sure opts.listen is an array, if its not convert it to an array whose
  // only member is the original value of opts.listen
  if (!(opts.listen instanceof Array)) {
    opts.listen = [opts.listen]
  }

  // Enforce the length of the array
  if (opts.listen.length > 3) {
    return cb(new Error('too many args for `listen`'))
  }

  // We gaurd against a callback being passed into opts.listen
  // Technically any of the values being a function is invalid so we just
  // check everything in the array
  for (var i = 0; i < opts.listen.length; i++) {
    if (typeof opts.listen[i] === 'function') {
      return cb(new Error('functions are not valid values for `listen`'))
    }
  }

  if (opts.routes && !(opts.routes instanceof Array)) {
    return cb(new Error('`routes` must be an array if present'))
  }

  if (opts.routes) {
    // Note that i was already defined above (function level scope in js)
    for (i = 0; i < opts.routes.length; i++) {
      if (!opts.routes[i].method) {
        return cb(new Error('`routes` object must define a `method`'))
      }
      if (!opts.routes[i].lambda) {
        return cb(new Error('`routes` object must define `lambda` function'))
      }
      if (!opts.routes[i].route) {
        return cb(new Error('`routes` object must define `route`'))
      }
    }
  }

  // Make sure that opts.routes is an array to simplify logic further down
  if (!opts.routes) opts.routes = []

  /* End scrubbing input */

  var server = http.createServer(function incommingMessage (req, resp) {
    // Search for a route that maps to the incomming request. If we don't
    // have a route that handles the request, we will return a 404
    var lambda = null

    // Note that i was already defined above (function level scope in js)
    // Also, this could be optimized by using a map if speed becomes an issue
    for (i = 0; i < opts.routes.length; i++) {
      if (req.method === opts.routes[i].method &&
          url.parse(req.url).path === opts.routes[i].route) {
        lambda = opts.routes[i].lambda
        break // We don't need to check the rest, we found are route
      }
    }

    // We didn't find a route in the above method
    if (!lambda) {
      resp.statusCode = 404
      return resp.end()
    }

    // Define a context object for this request to use
    var context = {}
    context.succeed = function succeed (obj) {
      resp.statusCode = 200
      return resp.end(JSON.stringify(obj))
    }
    context.fail = function fail (obj) {
      resp.statusCode = 500
      return resp.end(JSON.stringify(obj))
    }
    context.done = function done (e, obj) {
      if (e) return context.fail(e)
      return context.succeed(obj)
    }

    // Buffer the contents of the request into memory
    var body = ''
    req.on('data', function receivedData (data) {
      body += data.toString()
    })

    // Once we are done buffering the request into memory, we try to turn it
    // into a meaningful JavaScript Object and pass it into the lambda
    // function. If this process fails, we return a 500 status.
    req.on('end', function doneReceivingData () {
      // In the event of an empty request, body will be an empry string. This
      // causes it to fail being parsed by JSON.parse. In order to get around
      // this, we set it to the string representation of an empty object
      if (body.length === 0) body = '{}'

      try {
        var event = JSON.parse(body)
      } catch (e) {
        resp.statusCode = 500
        return resp.end()
      }
      return lambda(event, context)
    })
  })

  // Our server's `listen` function  gets called with `opts.listen` as it's
  // parameters, so we need our callback in that array. We make a copy to
  // prevent mutating the array passed into this function
  var listenArgs = JSON.parse(JSON.stringify(opts.listen))
  listenArgs.push(function serverListening (e) {
    return cb(e, server)
  })

  // Call listen with the options passed by the user
  server.listen.apply(server, listenArgs)
}
