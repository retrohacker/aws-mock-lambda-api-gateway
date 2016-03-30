var test = require('tape')
var mockGateway = require('../index.js')
var getAvailablePort = require('portfinder').getPort
var net = require('net')
var request = require('request')
var port = null // Our first test sets this to an available open port

// This test is a simple hack that lets us have a "setup" step in our test
// suite. Since getting a port is an async event, we have a test do it for us
// to make sure the other tests have it initialized.
test('Setup tests', function setupTests (t) {
  getAvailablePort(function haveAvailablePort (e, port_) {
    if (e) {
      throw e // We can't run these tests since we can't get a port
    }
    port = port_ // Now our tests have a safe port to use
    t.end()
  })
})

// cleanupConnections is used by the tests to shutdown both the TCP connection
// from net.connect as well as the server instance from the init function
function cleanupConnections (server, client) {
  if (client) {
    client.destroy()
  }
  if (server) {
    server.close(function serverClosed (e) {
      if (e) throw e // If the server fails to shutdown we are hosed
    })
  }
}

// We are going to tell the mockGateway to startup and listen on `port`, then
// we are going to make sure that it actually did. After everything is done,
// we will clean up all open connections
test('Starts and Stops HTTP server', function (t) {
  t.plan(2)
  var opts = {
    listen: port
  }

  mockGateway.init(opts, function (e, server) {
    t.error(e, 'init should not return error')
    // net.connect lets us check if there is a service listening on the port
    // without having to do a full http request
    var client = net.connect({port: port})
    client.on('error', function connectionFailed () {
      t.fail('Server did not start on specified port')
      cleanupConnections(server, client)
    })
    client.on('connect', function connectionSucceeded () {
      t.pass('Server started on specified port')
      cleanupConnections(server, client)
    })
  })
})

test('`opts` must be an object', function (t) {
  t.plan(2)
  var opts = 'fail'

  mockGateway.init(opts, function shouldReturnError (e) {
    t.ok(e, 'Should return error')
    if (!e) return null
    t.equal(e.message, '`opts` must be an object')
  })
})

test('Try to use `opts` as `cb` if `cb` is null', function (t) {
  t.plan(2)

  mockGateway.init(function shouldReturnError (e) {
    t.ok(e, 'Should return error')
    if (!e) return null
    t.equal(e.message, '`opts` object required')
  })
})

test('`listen` is required', function (t) {
  t.plan(2)
  mockGateway.init({}, function shouldReturnError (e) {
    t.ok(e, 'Should return error')
    if (!e) return null
    t.equal(e.message, '`listen` is required')
  })
})

test('`listen` defends against passing cb', function listenCallback (t) {
  t.plan(2)
  var opts = {
    listen: [function bad () {}]
  }

  mockGateway.init(opts, function (e) {
    t.ok(e, 'Should return error')
    if (!e) return null
    t.equal(e.message, 'functions are not valid values for `listen`')
  })
})

test('`listen` max length = 3', function (t) {
  t.plan(2)
  var opts = {
    listen: [port, '127.0.0.1', 100, 'invalid value']
  }

  mockGateway.init(opts, function shouldReturnError (e) {
    t.ok(e, 'Should return error')
    if (!e) return null
    t.equal(e.message, 'too many args for `listen`')
  })
})

test('`listen` accepts array definition', function (t) {
  t.plan(1)
  var opts = {
    listen: [port]
  }

  mockGateway.init(opts, function (e, server) {
    // net.connect lets us check if there is a service listening on the port
    // without having to do a full http request
    var client = net.connect({port: port})
    client.on('error', function connectionFailed () {
      t.fail('Server did not start on specified port')
      cleanupConnections(server, client)
    })
    client.on('connect', function connectionSucceeded () {
      t.pass('Server started on specified port')
      cleanupConnections(server, client)
    })
  })
})

test('`routes` must be an array', function (t) {
  t.plan(2)
  var opts = {
    routes: 'invalid',
    listen: port
  }

  mockGateway.init(opts, function shouldReturnError (e) {
    t.ok(e, 'Should return error')
    if (!e) return null
    t.equal(e.message, '`routes` must be an array if present')
  })
})

test('`routes` objects must have method', function (t) {
  t.plan(2)
  var opts = {
    routes: [{
      'route': '/metrics/value',
      'lambda': function (event, context) {}
    }],
    listen: port
  }

  mockGateway.init(opts, function shouldReturnError (e) {
    t.ok(e, 'Should return error')
    if (!e) return null
    t.equal(e.message, '`routes` object must define a `method`')
  })
})

test('`routes` objects must have route', function (t) {
  t.plan(2)
  var opts = {
    routes: [{
      'method': 'POST',
      'lambda': function (event, context) {}
    }],
    listen: port
  }

  mockGateway.init(opts, function shouldReturnError (e) {
    t.ok(e, 'Should return error')
    if (!e) return null
    t.equal(e.message, '`routes` object must define `route`')
  })
})

test('`routes` objects must have lambda', function (t) {
  t.plan(2)
  var opts = {
    routes: [{
      'method': 'POST',
      'route': '/metrics/value'
    }],
    listen: port
  }

  mockGateway.init(opts, function shouldReturnError (e) {
    t.ok(e, 'Should return error')
    if (!e) return null
    t.equal(e.message, '`routes` object must define `lambda` function')
  })
})

test('Gateway calls lambda function and success returns', function (t) {
  t.plan(6)

  // This object will be passed through the request and back to make sure that
  // requests are getting serialized into events and back
  var requestObject = {
    'foo': 'bar',
    'fizz': 'buzz'
  }

  function lambda (event, context) {
    // Make sure the requestObject is passed through to the event
    t.deepEqual(event,
               requestObject,
               'event and requestObject should have the same values')

    // Pass it back through and make sure the request gets it
    context.succeed(requestObject)
  }

  var opts = {
    routes: [{
      method: 'POST',
      route: '/metrics',
      lambda: lambda
    }],
    listen: port
  }

  mockGateway.init(opts, function serverListening (e, server) {
    t.error(e, 'Server should startup')
    t.ok(server, 'Should return a valid server object')
    request({
      url: 'http://127.0.0.1:' + port + '/metrics',
      method: 'POST',
      body: requestObject,
      json: true
    }, function requestCompleted (e, resp, body) {
      t.error(e, 'Request should complete')
      if (e) return cleanupConnections(server)
      t.equal(resp.statusCode, 200, 'statusCode should be 200')
      t.deepEqual(body,
                 requestObject,
                 'event and requestObject should have the same values')
      cleanupConnections(server)
    })
  })
})

test('Gateway handles fail', function (t) {
  t.plan(6)

  // This object will be passed through the request and back to make sure that
  // requests are getting serialized into events and back
  var requestObject = {
    'foo': 'bar',
    'fizz': 'buzz'
  }

  function lambda (event, context) {
    // Make sure the requestObject is passed through to the event
    t.deepEqual(event,
               requestObject,
               'event and requestObject should have the same values')

    // Pass it back through and make sure the request gets it
    context.fail(requestObject)
  }

  var opts = {
    routes: [{
      method: 'POST',
      route: '/metrics',
      lambda: lambda
    }],
    listen: port
  }

  mockGateway.init(opts, function serverListening (e, server) {
    t.error(e, 'Server should startup')
    t.ok(server, 'Should return a valid server object')
    request({
      url: 'http://127.0.0.1:' + port + '/metrics',
      method: 'POST',
      body: requestObject,
      json: true
    }, function requestCompleted (e, resp, body) {
      t.error(e, 'Request should complete')
      if (e) return cleanupConnections(server)
      t.equal(resp.statusCode, 500, 'statusCode should be 500')
      t.deepEqual(body,
                 requestObject,
                 'event and requestObject should have the same values')
      cleanupConnections(server)
    })
  })
})

test('Gateway.done handles success', function (t) {
  t.plan(6)

  // This object will be passed through the request and back to make sure that
  // requests are getting serialized into events and back
  var requestObject = {
    'foo': 'bar',
    'fizz': 'buzz'
  }

  function lambda (event, context) {
    // Make sure the requestObject is passed through to the event
    t.deepEqual(event,
               requestObject,
               'event and requestObject should have the same values')

    // Pass it back through and make sure the request gets it
    context.done(null, requestObject)
  }

  var opts = {
    routes: [{
      method: 'POST',
      route: '/metrics',
      lambda: lambda
    }],
    listen: port
  }

  mockGateway.init(opts, function serverListening (e, server) {
    t.error(e, 'Server should startup')
    t.ok(server, 'Should return a valid server object')
    request({
      url: 'http://127.0.0.1:' + port + '/metrics',
      method: 'POST',
      body: requestObject,
      json: true
    }, function requestCompleted (e, resp, body) {
      t.error(e, 'Request should complete')
      if (e) return cleanupConnections(server)
      t.equal(resp.statusCode, 200, 'statusCode should be 200')
      t.deepEqual(body,
                 requestObject,
                 'event and requestObject should have the same values')
      cleanupConnections(server)
    })
  })
})

test('Gateway.done handles failure', function (t) {
  t.plan(6)

  // This object will be passed through the request and back to make sure that
  // requests are getting serialized into events and back
  var requestObject = {
    'foo': 'bar',
    'fizz': 'buzz'
  }

  function lambda (event, context) {
    // Make sure the requestObject is passed through to the event
    t.deepEqual(event,
               requestObject,
               'event and requestObject should have the same values')

    // Pass it back through and make sure the request gets it
    context.done(requestObject)
  }

  var opts = {
    routes: [{
      method: 'POST',
      route: '/metrics',
      lambda: lambda
    }],
    listen: port
  }

  mockGateway.init(opts, function serverListening (e, server) {
    t.error(e, 'Server should startup')
    t.ok(server, 'Should return a valid server object')
    request({
      url: 'http://127.0.0.1:' + port + '/metrics',
      method: 'POST',
      body: requestObject,
      json: true
    }, function requestCompleted (e, resp, body) {
      t.error(e, 'Request should complete')
      if (e) return cleanupConnections(server)
      t.equal(resp.statusCode, 500, 'statusCode should be 500')
      t.deepEqual(body,
                 requestObject,
                 'event and requestObject should have the same values')
      cleanupConnections(server)
    })
  })
})

test('Gateway functions with no routes', function (t) {
  t.plan(4)

  var opts = {
    routes: [],
    listen: port
  }

  mockGateway.init(opts, function serverListening (e, server) {
    t.error(e, 'Server should startup')
    t.ok(server, 'Should return a valid server object')
    request({
      url: 'http://127.0.0.1:' + port + '/metrics',
      method: 'POST'
    }, function requestCompleted (e, resp, body) {
      t.error(e, 'Request should complete')
      if (e) return cleanupConnections(server)
      t.equal(resp.statusCode, 404, 'statusCode should be 404')
      cleanupConnections(server)
    })
  })
})

test('Gateway handles malformed JSON in body', function (t) {
  t.plan(4)

  var opts = {
    routes: [{
      method: 'POST',
      route: '/metrics',
      lambda: function () {}
    }],
    listen: port
  }

  mockGateway.init(opts, function serverListening (e, server) {
    t.error(e, 'Server should startup')
    t.ok(server, 'Should return a valid server object')
    request({
      url: 'http://127.0.0.1:' + port + '/metrics',
      method: 'POST',
      body: '{ this should fail }'
    }, function requestCompleted (e, resp, body) {
      t.error(e, 'Request should complete')
      if (e) return cleanupConnections(server)
      t.equal(resp.statusCode, 500, 'statusCode should be 500')
      cleanupConnections(server)
    })
  })
})

test('Gateway picks from multiple routes', function (t) {
  t.plan(5)

  function callMe (event, context) {
    t.pass('/foo should be called')
    context.succeed()
  }

  function dontCallMe (event, context) {
    t.fail('/metrics was called instead of /foo')
  }

  var opts = {
    routes: [{
      method: 'POST',
      route: '/metrics',
      lambda: dontCallMe
    }, {
      method: 'GET',
      route: '/foo',
      lambda: callMe
    }],
    listen: port
  }

  mockGateway.init(opts, function serverListening (e, server) {
    t.error(e, 'Server should startup')
    t.ok(server, 'Should return a valid server object')
    request({
      url: 'http://127.0.0.1:' + port + '/foo',
      method: 'GET'
    }, function requestCompleted (e, resp, body) {
      t.error(e, 'Request should complete')
      if (e) return cleanupConnections(server)
      t.equal(resp.statusCode, 200, 'statusCode should be 200')
      cleanupConnections(server)
    })
  })
})
