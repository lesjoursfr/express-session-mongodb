import assert from "assert";
import { SessionData } from "express-session";
import { Collection, MongoClient } from "mongodb";
import sinon, { SinonStubbedInstance } from "sinon";
import { MongoDBStore } from "../../src/index";

describe("connectMongoDBSession - options", function () {
  afterEach(() => sinon.restore());

  it("can specify uri", function (done) {
    const session = new MongoDBStore({ uri: "mongodb://host:1111/db" });

    assert.equal(session.options.uri, "mongodb://host:1111/db");
    assert.equal(session.options.idField, "_id");
    done();
  });

  it("can specify collection", function (done) {
    const session = new MongoDBStore({ collection: "notSessions" });

    assert.equal(session.options.uri, "mongodb://127.0.0.1:27017/test");
    assert.equal(session.options.collection, "notSessions");
    done();
  });

  it("can specify expires", function (done) {
    const session = new MongoDBStore({ expires: 25 });

    assert.equal(session.options.uri, "mongodb://127.0.0.1:27017/test");
    assert.equal(session.options.expires, 25);
    done();
  });

  it("can specify idField", function (done) {
    const session = new MongoDBStore({ idField: "sessionId" });

    assert.equal(session.options.uri, "mongodb://127.0.0.1:27017/test");
    assert.deepEqual(session._generateQuery("1234"), { sessionId: "1234" });
    done();
  });

  it("can specify databaseName", function (done) {
    const session = new MongoDBStore({ databaseName: "other_db" });

    assert.equal(session.options.databaseName, "other_db");
    done();
  });
});

describe("connectMongoDBSession", function () {
  afterEach(() => sinon.restore());

  it("specifying options is optional", function (done) {
    sinon.stub(MongoClient.prototype, "connect").callsFake((() => {
      return Promise.resolve();
    }) as unknown as typeof MongoClient.prototype.connect);
    sinon.stub(Collection.prototype, "createIndex").callsFake((() => {
      return Promise.resolve();
    }) as unknown as typeof Collection.prototype.createIndex);

    const session = new MongoDBStore(function (error) {
      assert.ifError(error);
      done();
    });
    assert.equal(session.options.uri, "mongodb://127.0.0.1:27017/test");
  });

  it("uses default options and no callback if no args passed", function (done) {
    sinon.stub(MongoClient.prototype, "connect").callsFake((() => {
      return Promise.resolve();
    }) as unknown as typeof MongoClient.prototype.connect);
    sinon.stub(Collection.prototype, "createIndex").callsFake((() => {
      return Promise.resolve();
    }) as unknown as typeof Collection.prototype.createIndex);

    const session = new MongoDBStore();

    assert.equal(session.options.uri, "mongodb://127.0.0.1:27017/test");
    session.on("connected", function () {
      done();
    });
  });

  it("passes error to callback if specified", function (done) {
    sinon.stub(MongoClient.prototype, "connect").callsFake(() => {
      return Promise.reject(new Error("connect issues"));
    });

    let numSources = 2;
    const store = new MongoDBStore(function (error) {
      assert.ok(error);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      --numSources || done();
    });
    store.once("error", function (error) {
      assert.ok(error);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      --numSources || done();
    });
  });

  it("handles index errors", function (done) {
    sinon.stub(MongoClient.prototype, "connect").callsFake((() => {
      return Promise.resolve();
    }) as unknown as typeof MongoClient.prototype.connect);
    sinon.stub(Collection.prototype, "createIndex").callsFake(() => {
      return Promise.reject(new Error("Index fail"));
    });

    new MongoDBStore(function (error) {
      assert.equal((error as Error).message, "Error creating index: Index fail");
      done();
    });
  });
});

describe("connectMongoDBSession - get()", function () {
  afterEach(() => sinon.restore());

  it("gets the session", function (done) {
    const session = new MongoDBStore();
    sinon.stub(session.collection, "findOne").callsFake(() => {
      return Promise.resolve({ expires: new Date("2040-06-01T00:00:00.000Z"), session: { data: 1 } });
    });

    session.get("1234", function (error, session) {
      assert.ifError(error);
      assert.deepStrictEqual(session, { data: 1 });
      done();
    });
  });

  it("handles get() errors", function (done) {
    const session = new MongoDBStore();
    sinon.stub(session.collection, "findOne").callsFake(() => {
      return Promise.reject(new Error("fail!"));
    });

    session.get("1234", function (error) {
      assert.ok(error);
      assert.equal(error.message, "Error finding 1234: fail!");
      done();
    });
  });

  it("calls destroy() on stale sessions", function (done) {
    const session = new MongoDBStore();
    sinon.stub(session.collection, "findOne").callsFake(() => {
      return Promise.resolve({ expires: new Date("2011-06-01T00:00:00.000Z") });
    });
    sinon.stub(session.collection, "deleteOne").callsFake(() => {
      return Promise.resolve({ acknowledged: true, deletedCount: 1 });
    });

    session.get("1234", function (error, doc) {
      assert.ifError(error);
      assert.ok(!doc);
      assert.equal((session.collection as SinonStubbedInstance<Collection>).deleteOne.getCalls().length, 1);
      done();
    });
  });

  it("returns empty if no session found", function (done) {
    const session = new MongoDBStore();
    sinon.stub(session.collection, "findOne").callsFake(() => {
      return Promise.resolve(null);
    });

    session.get("1234", function (error, doc) {
      assert.ifError(error);
      assert.ok(!doc);
      done();
    });
  });
});

describe("connectMongoDBSession - destroy()", function () {
  afterEach(() => sinon.restore());

  it("reports driver errors", function (done) {
    const session = new MongoDBStore();
    sinon.stub(session.collection, "deleteOne").callsFake(() => Promise.reject(new Error("roadrunners pachyderma")));

    session.destroy("1234", function (error) {
      assert.ok(error);
      assert.equal(error.message, "Error destroying 1234: roadrunners pachyderma");
      done();
    });
  });
});

describe("connectMongoDBSession - set()", function () {
  afterEach(() => sinon.restore());

  it("converts expires to a date", function (done) {
    const session = new MongoDBStore();
    sinon.stub(session.collection, "updateOne").callsFake(() => {
      return Promise.resolve({
        acknowledged: true,
        modifiedCount: 1,
        matchedCount: 1,
        upsertedCount: 0,
        upsertedId: null,
      });
    });

    const update = {
      test: 1,
      cookie: { expires: "2011-06-01T00:00:00.000Z" },
    };
    session.set("1234", update as unknown as SessionData, function (error) {
      assert.ifError(error);
      assert.equal((session.collection as SinonStubbedInstance<Collection>).updateOne.getCalls().length, 1);

      const firstCall = // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.collection as SinonStubbedInstance<Collection>).updateOne.getCalls()[0].args[1] as any;

      assert.ok(firstCall.$set.expires instanceof Date);
      assert.equal(firstCall.$set.expires.getTime(), new Date("2011-06-01T00:00:00.000Z").getTime());
      done();
    });
  });

  it("handles set() errors", function (done) {
    const session = new MongoDBStore();
    sinon.stub(session.collection, "updateOne").callsFake(() => {
      return Promise.reject(new Error("taco tuesday"));
    });

    session.set("1234", {} as SessionData, function (error) {
      assert.ok(error);
      assert.equal(error.message, "Error setting 1234 to {}: taco tuesday");
      done();
    });
  });
});

describe("connectMongoDBSession - get()", function () {
  afterEach(() => sinon.restore());

  it("clears the session store", function (done) {
    const session = new MongoDBStore();
    sinon
      .stub(session.collection, "deleteMany")
      .callsFake(() => Promise.resolve({ acknowledged: true, deletedCount: 1 }));

    session.clear(function (error) {
      assert.ifError(error);
      assert.ok((session.collection as SinonStubbedInstance<Collection>).deleteMany.calledOnce);
      assert.deepStrictEqual(
        (session.collection as SinonStubbedInstance<Collection>).deleteMany.getCalls()[0].args[0],
        {}
      );
      done();
    });
  });

  it("handles set() errors", function (done) {
    const session = new MongoDBStore();
    sinon.stub(session.collection, "deleteMany").callsFake(() => Promise.reject(new Error("clear issue")));

    session.clear(function (error) {
      assert.ok(error);
      assert.equal(error.message, "Error clearing all sessions: clear issue");
      done();
    });
  });
});
