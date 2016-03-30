AWS Mock Lambda API Gateway
===========================

It can often be difficult to run your AWS Lambda Functions locally.

The purpose of this module is to wire a collection of Lambda Functions up to a local http server in a similar, but not identical, way to the API Gateway on AWS.

**The purpose of this module is not to reach feature parity with the API Gateway**. It is to simply allow you to make HTTP requests against your Lambda functions in a sane way. It does not spin up child processes etc, but runs the Lambda Function on the same event loop as the mock API server.

**This is for development use only, do not run in production**

# API


```javascript
module.exports.init = function init(opts, cb)
```

This API Exposes a single function which bootstraps the server. From that point froward, the state of the server should be considered immutable. To put it another way, this module does not support dynamically adding or removing routes.

`cb` is an error first function

```javascript
function cb(e, server)
```

Where server has a single function:

```javascript
end(cb)
```

End shuts down the listening server and calls the supplied callback with an error if any


The `opts` object is required.

```javascript
opts : {
  routes: [], // Defined below
  listen: []  // Defined below
}
```

The `listen` key can be either a single value or an array. It represents the arguments that `http.createServer` will be called with.

The `routes` array contains a collection of objects that map an HTTP route to a lambda function. We do not enforce that the values be valid in regards to the API Gateway specification, we simply check `http.IncomingMessage` for matching values. They should be in the form:

```javascript
{
  method: 'POST',          // I.E. 'GET', 'POST', 'PUT', etc (required)
  route: '/metrics/value', // Only exact matches get routed (required)
  lambda: function (event, context) {}
}
```

We do not support timeouts, if your lambda function stalls, the request will hang.

## `context` object

The context object currently has the following keys:

`context.succeed(obj)`: This will return a 200 statusCode
`context.fail(obj)`: This will return a 500 statusCode
`context.done(e, obj)`: Combines behaviour of `fail` and `succeed` via `e`

## `event` object

The event object is an unaltered copy of the contents of the `http.incomingMessage`
's body passed through `JSON.parse`. This library does not currently offer a way to modify this object.

If `JSON.parse` fails, the server will return a 500 statusCode.

# Example

```javascript
var lambdaFunc = require('./index.js')

require('aws-mock-lambda-api-gateway').init({
    routes: [
      {
        method: 'POST',
        route: '/metrics'
        lambda: lambdaFunc
      }
    ],
    listen: [8080,'0.0.0.0']
  }, function (e) {
    if(e) throw e
    console.log('Server Listening...')
})
```

# Development

The officially supported method for developing for this module is to use the included `Makefile`.

Running `make` will give you a full list of commands available for development.

`make test` is the most important. It runs the unit tests everytime the local filesystem changes allowing you to do test driven development.
