import { mkdirSync } from "fs";
import type { MongoMemoryServer } from "mongodb-memory-server";
import { join } from "path";

function randomTempPath(prefix: string): string {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < 6) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }

  return join("/dev/shm/", `${prefix}${result}`);
}

type MongoMemoryServerOptions = Parameters<typeof MongoMemoryServer.create>[0];

const kMongoDbIp = "127.0.0.1";
const kMongoDbPort = 13151;
const kMongoDbName = "lesjours_mocha";

export const kMongoMemoryServerURI = `mongodb://${kMongoDbIp}:${kMongoDbPort}/${kMongoDbName}`;

export function createMongoMemoryServerOpts(): MongoMemoryServerOptions {
  const kMongoDbPath = randomTempPath("mms-");
  mkdirSync(kMongoDbPath);

  return {
    instance: { ip: kMongoDbIp, port: kMongoDbPort, dbName: kMongoDbName, dbPath: kMongoDbPath },
    binary: { os: { os: "linux", dist: "ubuntu", release: "22.04" } },
  };
}
