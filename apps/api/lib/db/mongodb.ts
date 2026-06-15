// lib/mongo.ts
import { MongoClient } from "mongodb";
type Purpose = "app" | "analytics" | "migrations";
const URIs: Record<Purpose, string> = {
  app: process.env.MONGODB_URI_APP!,
  analytics: process.env.MONGODB_URI_ANALYTICS_RO!,
  migrations: process.env.MONGODB_URI_MIGRATIONS!, // never used in prod runtime
};

const MIN_NODE_MAJOR = 18;
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const DEV_MAX_POOL_SIZE = 3;
const DEFAULT_MAX_POOL_SIZE = 10;

declare global {
  // Keep Mongo client promises stable across dev HMR/module reloads.
  // eslint-disable-next-line no-var
  var __ckdMongoClients:
    | Partial<Record<Purpose, Promise<MongoClient>>>
    | undefined;
}

function getClientCache() {
  if (!globalThis.__ckdMongoClients) {
    globalThis.__ckdMongoClients = {};
  }
  return globalThis.__ckdMongoClients;
}

function assertSupportedRuntime() {
  const [major] = process.versions.node.split(".").map(Number);

  if (Number.isNaN(major) || major < MIN_NODE_MAJOR) {
    throw new Error(
      `Unsupported Node.js runtime ${process.versions.node}. ` +
        `This app requires Node.js ${MIN_NODE_MAJOR}+ for Next.js 15 and MongoDB Atlas TLS. ` +
        `Switch to a supported Node version and restart the API server.`,
    );
  }
}

export function getClient(purpose: Purpose = "app") {
  assertSupportedRuntime();
  const clients = getClientCache();

  if (!clients[purpose]) {
    const client = new MongoClient(URIs[purpose], {
      maxPoolSize: IS_DEVELOPMENT ? DEV_MAX_POOL_SIZE : DEFAULT_MAX_POOL_SIZE,
      retryWrites: true,
      serverSelectionTimeoutMS: 5000,
    });
    clients[purpose] = client.connect();
  }
  return clients[purpose]!;
}

export async function getDb(purpose: Purpose = "app", dbName = "ckd-copilot") {
  const client = await getClient(purpose);
  return client.db(dbName);
}
