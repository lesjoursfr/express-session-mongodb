[![npm version](https://badge.fury.io/js/@lesjoursfr%2Fexpress-session-mongodb.svg)](https://badge.fury.io/js/@lesjoursfr%2Fexpress-session-mongodb)
[![QC Checks](https://github.com/lesjoursfr/express-session-mongodb/actions/workflows/quality-control.yml/badge.svg)](https://github.com/lesjoursfr/express-session-mongodb/actions/workflows/quality-control.yml)

# @lesjoursfr/express-session-mongodb

[MongoDB](http://mongodb.com) backed session storage for [Express](http://www.expressjs.com).
This is a fork of the [mongodb-js/connect-mongodb-session](https://github.com/mongodb-js/connect-mongodb-session) project.

# MongoDBStore

This module exports a `MongoDBStore` class that can be used to
store sessions in MongoDB.

This module also exports 2 middleware functions:

- `ensureLoggedIn`: redirects to a specified page if the user is not logged in
- `ensureLoggedOut`: redirects to a specified page if the user is logged in

## It can store sessions for Express 5

The MongoDBStore class has 3 required options:

1. `uri`: a [MongoDB connection string](http://docs.mongodb.org/manual/reference/connection-string/)
2. `databaseName`: the MongoDB database to store sessions in
3. `collection`: the MongoDB collection to store sessions in

**Note:** You can pass a callback to the `MongoDBStore` constructor,
but this is entirely optional. The Express 5.x example demonstrates
that you can use the MongoDBStore class in a synchronous-like style: the
module will manage the internal connection state for you.

```javascript
const express = require("express");
const expressSession = require("express-session");
const { MongoDBStore } = require("@lesjoursfr/express-session-mongodb");

const app = express();
const store = new MongoDBStore({
	uri: "mongodb://127.0.0.1:27017/connect_mongodb_session_test",
	collection: "mySessions",
});

// Catch errors
store.on("error", function (error) {
	console.log(error);
});

app.use(
	expressSession({
		secret: "This is a secret",
		cookie: {
			maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
		},
		store: store,
		// Boilerplate options, see:
		// * https://www.npmjs.com/package/express-session#resave
		// * https://www.npmjs.com/package/express-session#saveuninitialized
		resave: true,
		saveUninitialized: true,
	})
);

app.get("/", function (req, res) {
	res.send("Hello " + JSON.stringify(req.session));
});

const server = app.listen(3000);
```

## It throws an error when it can't connect to MongoDB

You should pass a callback to the `MongoDBStore` constructor to catch
errors. If you don't pass a callback to the `MongoDBStore` constructor,
`MongoDBStore` will `throw` if it can't connect.

```javascript
const express = require("express");
const expressSession = require("express-session");
const { MongoDBStore } = require("@lesjoursfr/express-session-mongodb");

const app = express();
const store = new MongoDBStore(
	{
		uri: "mongodb://bad.host:27000/connect_mongodb_session_test?connectTimeoutMS=10",
		databaseName: "connect_mongodb_session_test",
		collection: "mySessions",
	},
	function (error) {
		// Should have gotten an error
	}
);

store.on("error", function (error) {
	// Also get an error here
});

app.use(
	expressSession({
		secret: "This is a secret",
		cookie: {
			maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
		},
		store: store,
		// Boilerplate options, see:
		// * https://www.npmjs.com/package/express-session#resave
		// * https://www.npmjs.com/package/express-session#saveuninitialized
		resave: true,
		saveUninitialized: true,
	})
);

app.get("/", function (req, res) {
	res.send("Hello " + JSON.stringify(req.session));
});

const server = app.listen(3000);
```

## It exports middleware to ensure login status

These middlewares functions will use the existing `isAuthenticated` method on the
request object to determine if the user is logged in or not. This behavior allows
integration with existing authentication middleware such as `passport`.
If there is no `isAuthenticated` method on the request object, these middlewares
will check for the existence of `req.user` to determine if the user is logged in.

```javascript
const express = require("express");
const {
	ensureLoggedIn,
	ensureLoggedOut,
} = require("@lesjoursfr/express-session-mongodb");

const app = express();

app.get("/profile", ensureLoggedIn("/login"), function (req, res) {
	res.send("This is the profile page for " + req.session.user.username);
});
app.get("/login", ensureLoggedOut("/profile"), function (req, res) {
	res.send("This is the login page");
});
```

## It supports several other options

There are several other options you can pass to `new MongoDBStore()`:

```javascript
const express = require("express");
const expressSession = require("express-session");
const { MongoDBStore } = require("@lesjoursfr/express-session-mongodb");

const store = new MongoDBStore({
	uri: "mongodb://127.0.0.1:27017/connect_mongodb_session_test",
	collection: "mySessions",

	// By default, sessions expire after 2 weeks. The `expires` option lets
	// you overwrite that by setting the expiration in milliseconds
	expires: 1000 * 60 * 60 * 24 * 30, // 30 days in milliseconds

	// Lets you set options passed to `MongoClient.connect()`. Useful for
	// configuring connectivity or working around deprecation warnings.
	connectionOptions: {
		serverSelectionTimeoutMS: 10000,
	},
});
```

## Azure Cosmos MongoDB support

It can support MongoDB instances inside Azure Cosmos. As Cosmos can only support
time-based index on fields called `_ts`, you will need to update your configuration.
Unlike in MongoDB, Cosmos starts the timer at the point of document creation so the
`expiresAfterSeconds` should have the same value as `expires` - as `expires` is in
milliseconds, the `expiresAfterSeconds` must equal `expires / 1000`.

```javascript
const express = require("express");
const expressSession = require("express-session");
const { MongoDBStore } = require("@lesjoursfr/express-session-mongodb");

const store = new MongoDBStore({
	uri: "mongodb://username:password@cosmosdb-name.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@cosmosdb-name@",
	databaseName: "myDb",
	collection: "mySessions",

	// Change the expires key name
	expiresKey: `_ts`,
	// This controls the life of the document - set to same value as expires / 1000
	expiresAfterSeconds: 60 * 60 * 24 * 14,
});
```
