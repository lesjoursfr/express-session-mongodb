import { SessionData, Store } from "express-session";
import { Collection, Db, MongoClient, MongoClientOptions } from "mongodb";
import { inspect } from "util";

export type MongoDBStoreOptions = {
  uri: string;
  collection: string;
  connectionOptions: MongoClientOptions | null;
  expires: number;
  idField: string;
  databaseName: string | null;
  expiresKey: string;
  expiresAfterSeconds: number;
};

const kDefaultOptions: Readonly<MongoDBStoreOptions> = Object.freeze({
  uri: "mongodb://127.0.0.1:27017/test",
  collection: "sessions",
  connectionOptions: null,
  expires: 1000 * 60 * 60 * 24 * 14, // 2 weeks
  idField: "_id",
  databaseName: null,
  expiresKey: "expires",
  expiresAfterSeconds: 0,
});

export class MongoDBStore extends Store {
  public options: MongoDBStoreOptions;
  public client: MongoClient;
  public db: Db;
  public collection: Collection;

  /**
   * Creates an instance of MongoDBStore.
   * @param op - The options for the store (optional).
   * @param callback - The callback  to call once the store is ready (optional).
   */
  constructor(op?: Partial<MongoDBStoreOptions> | ((err?: Error) => void), callback?: (err?: Error) => void) {
    // Call the Store constructor
    super();

    // Add defaults values
    if (op === undefined) {
      op = {};
    } else if (typeof op === "function") {
      callback = op;
      op = {};
    }
    this.options = { ...kDefaultOptions, ...op };

    // Create a new MongoClient
    this.client = new MongoClient(this.options.uri, this.options.connectionOptions ?? {});
    this.db = this.options.databaseName === null ? this.client.db() : this.client.db(this.options.databaseName);
    this.collection = this.db.collection(this.options.collection);

    // Open the connection
    this.client
      .connect()
      .then(async () => {
        const expiresIndex: { [key: string]: number } = {};
        expiresIndex[this.options.expiresKey] = 1;

        // Create an Index on the expires field
        try {
          await this.collection.createIndex(expiresIndex, { expireAfterSeconds: this.options.expiresAfterSeconds });
        } catch (err) {
          const e = new Error(`Error creating index: ${(err as Error).message}`);
          return this._handleError(e, callback);
        }

        // Call the callback & emit the connected event
        process.nextTick(() => callback && callback());
        this.emit("connected");
        return this.client;
      })
      .catch((error) => {
        const e = new Error(`Error connecting to db: ${(error as Error).message}`);
        this._handleError(e, callback);
      });
  }

  /**
   * Gets the session from the store given a session ID and passes it to `callback`.
   *
   * The `session` argument should be a `Session` object if found, otherwise `null` or `undefined` if the session was not found and there was no error.
   * A special case is made when `error.code === 'ENOENT'` to act like `callback(null, null)`.
   *
   * @param sid - The session ID.
   * @param callback - The callback to call with the session.
   */
  public get(sid: string, callback: (err?: Error | null, session?: SessionData | null) => void): void {
    this.collection
      .findOne(this._generateQuery(sid))
      .then((session) => {
        if (session) {
          if (!session.expires || new Date() < session.expires) {
            return process.nextTick(() => callback(null, session.session));
          } else {
            return this.destroy(sid, callback);
          }
        } else {
          return process.nextTick(() => callback());
        }
      })
      .catch((error) => {
        const e = new Error(`Error finding ${sid}: ${error.message}`);
        return this._handleError(e, callback);
      });
  }

  /**
   * Upsert a session in the store given a session ID and `SessionData`
   * @param sid - The session ID.
   * @param session - The session data.
   * @param callback - The callback to call once the session is set (optional).
   */
  public set(sid: string, session: SessionData, callback?: (err?: Error) => void): void {
    const sess: Partial<SessionData> = {};
    for (const key in session) {
      sess[key as keyof SessionData] = session[key as keyof SessionData];
    }

    const s: { [key: string]: string | Date | SessionData } = this._generateQuery(sid);
    s.session = sess as SessionData;
    if (session && session.cookie && session.cookie.expires) {
      s[this.options.expiresKey] = new Date(session.cookie.expires);
    } else {
      const now = new Date();
      s[this.options.expiresKey] = new Date(now.getTime() + this.options.expires);
    }

    this.collection
      .updateOne(this._generateQuery(sid), { $set: s }, { upsert: true })
      .then(() => {
        process.nextTick(() => callback && callback());
      })
      .catch((error) => {
        const e = new Error(`Error setting ${sid} to ${inspect(session)}: ${error.message}`);
        return this._handleError(e, callback);
      });
  }

  /**
   * Destroys the session with the given session ID.
   * @param sid - The session ID.
   * @param callback - The callback to call once the session is destroyed (optional).
   */
  public destroy(sid: string, callback?: (err?: Error) => void): void {
    this.collection
      .deleteOne(this._generateQuery(sid))
      .then(() => {
        process.nextTick(() => callback && callback());
      })
      .catch((error) => {
        const e = new Error(`Error destroying ${sid}: ${error.message}`);
        return this._handleError(e, callback);
      });
  }

  /**
   * Returns all sessions in the store
   * @param callback - The callback to call with all sessions.
   */
  public all(callback: (err?: Error | null, obj?: SessionData[] | null) => void): void {
    if (!this.db) {
      this.once("connected", () => {
        this.all(callback);
      });
      return;
    }

    this.db
      .collection(this.options.collection)
      .find<SessionData>({})
      .toArray()
      .then((sessions) => {
        if (sessions) {
          return callback(null, sessions);
        } else {
          return callback();
        }
      })
      .catch((error) => {
        const e = new Error(`Error gathering sessions: ${error.message}`);
        return this._handleError(e, callback);
      });
  }

  /**
   * Delete all sessions from the store.
   * @param callback - The callback to call once the store is cleared (optional).
   */
  public clear(callback?: (err?: Error) => void): void {
    this.collection
      .deleteMany({})
      .then(() => {
        process.nextTick(() => callback && callback());
      })
      .catch((error) => {
        const e = new Error(`Error clearing all sessions: ${error.message}`);
        return this._handleError(e, callback);
      });
  }

  /**
   * Generates a query object for the given session ID.
   * @param sid - The session ID.
   * @returns The query object.
   */
  public _generateQuery(sid: string): { [key: string]: string } {
    const ret: { [key: string]: string } = {};
    ret[this.options.idField] = sid;
    return ret;
  }

  /**
   * Handles errors that occur during database operations.
   * @param error - The error object.
   * @param callback - The callback to call with the error (optional).
   */
  public _handleError(error: Error, callback?: (err?: Error) => void) {
    if (this.listeners("error").length) {
      this.emit("error", error);
    }

    if (callback) {
      callback(error);
    }

    if (!this.listeners("error").length && !callback) {
      throw error;
    }
  }
}
