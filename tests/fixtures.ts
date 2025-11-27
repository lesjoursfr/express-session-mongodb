import { rmSync } from "fs-extra";
import { Runner } from "mocha";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createMongoMemoryServerOpts } from "./toolbox";

let mongoServer: MongoMemoryServer;

export async function mochaGlobalSetup(this: Runner) {
  console.log("Start a MongoDB server...");
  mongoServer = await MongoMemoryServer.create(createMongoMemoryServerOpts());
  const dbPath = mongoServer.instanceInfo!.dbPath;
  console.log(`MongoDB server running on port ${mongoServer.instanceInfo?.port}`);
  console.log(`MongoDB server dbPath: ${dbPath}`);
}

export async function mochaGlobalTeardown(this: Runner) {
  const dbPath = mongoServer.instanceInfo!.dbPath;

  console.log("Stop the MongoDB server...");
  await mongoServer.stop();
  console.log("MongoDB server stopped!");

  console.log(`Remove the MongoDB server folder [${dbPath}]...`);
  rmSync(dbPath, { recursive: true });
  console.log("MongoDB server folder removed!");
}
