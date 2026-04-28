import assert from "assert";
import { parse as parseCookie } from "cookie";
import express from "express";
import expressSession from "express-session";
import http from "http";
import { Db, MongoClient } from "mongodb";
import superagent from "superagent";
import { MongoDBStore } from "../../src/index.js";
import { kMongoMemoryServerURI } from "../toolbox.js";

/**
 *  This module exports a single function which takes an instance of connect
 *  (or Express) and returns a `MongoDBStore` class that can be used to
 *  store sessions in MongoDB.
 */
describe("MongoDBStore", function () {
  let underlyingDb: Db;
  let server: http.Server;

  beforeEach(async function () {
    const client = await MongoClient.connect(kMongoMemoryServerURI, {
      serverSelectionTimeoutMS: 5000,
    });
    underlyingDb = client.db("lesjours_mocha");
    await client.db("lesjours_mocha").collection("mySessions").deleteMany({});
  });

  afterEach(async function () {
    await underlyingDb.client.close();
    server?.close();
  });

  /**
   *  If you pass in an instance of the
   *  [`express-session` module](http://npmjs.org/package/express-session)
   *  the MongoDBStore class will enable you to store your Express sessions
   *  in MongoDB.
   *
   *  The MongoDBStore class has 3 required options:
   *
   *  1. `uri`: a [MongoDB connection string](http://docs.mongodb.org/manual/reference/connection-string/)
   *  2. `databaseName`: the MongoDB database to store sessions in
   *  3. `collection`: the MongoDB collection to store sessions in
   *
   *  **Note:** You can pass a callback to the `MongoDBStore` constructor,
   *  but this is entirely optional. The Express 5.x example demonstrates
   *  that you can use the MongoDBStore class in a synchronous-like style: the
   *  module will manage the internal connection state for you.
   */
  it("can store sessions for Express 5", async function () {
    const app = express();
    const store = new MongoDBStore({
      uri: kMongoMemoryServerURI,
      collection: "mySessions",
    });

    store.on("connected", function () {
      assert.ok(store.client);
      assert.ok(store.db);
    });

    // Catch errors
    store.on("error", function (error) {
      console.log(error);
      assert.ifError(error);
      assert.ok(false);
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

    server = app.listen(3000);

    let count = await underlyingDb.collection("mySessions").countDocuments({});
    assert.equal(0, count);

    let response = await superagent.get("http://127.0.0.1:3000");
    assert.equal(1, response.headers["set-cookie"].length);
    const cookie = parseCookie(response.headers["set-cookie"][0]);
    assert.ok(cookie["connect.sid"]);
    count = await underlyingDb.collection("mySessions").countDocuments({});
    assert.equal(count, 1);
    response = await superagent.get("http://127.0.0.1:3000").set("Cookie", "connect.sid=" + cookie["connect.sid"]);
    assert.ok(!response.headers["set-cookie"]);
    await new Promise((resolve) => {
      store.clear(async function () {
        count = await underlyingDb.collection("mySessions").countDocuments({});
        assert.equal(count, 0);
        resolve(null);
      });
    });
  });

  /**
   *  You should pass a callback to the `MongoDBStore` constructor to catch
   *  errors. If you don't pass a callback to the `MongoDBStore` constructor,
   *  `MongoDBStore` will `throw` if it can't connect.
   */
  it("throws an error when it can't connect to MongoDB", function (done) {
    const app = express();
    let numExpectedSources = 2;
    const store = new MongoDBStore(
      {
        uri: "mongodb://bad.host:27000/connect_mongodb_session_test?serverSelectionTimeoutMS=100",
        databaseName: "connect_mongodb_session_test",
        collection: "mySessions",
      },
      function (error?: Error) {
        // Should have gotten an error
        assert.ok(error);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        --numExpectedSources || done();
      }
    );

    store.on("error", function (error: Error) {
      // Also get an error here
      assert.ok(error);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      --numExpectedSources || done();
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

    server = app.listen(3000);
  });

  /**
   * There are several other options you can pass to `new MongoDBStore()`:
   */
  it("supports several other options", function () {
    new MongoDBStore({
      uri: kMongoMemoryServerURI,
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
  });
});
