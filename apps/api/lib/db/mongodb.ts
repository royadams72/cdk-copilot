// lib/mongo.ts
import { MongoClient } from "mongodb";
type Purpose = "app" | "analytics" | "migrations";
const URIs: Record<Purpose, string> = {
  app: process.env.MONGODB_URI_APP!,
  analytics: process.env.MONGODB_URI_ANALYTICS_RO!,
  migrations: process.env.MONGODB_URI_MIGRATIONS!, // never used in prod runtime
};

const clients: Partial<Record<Purpose, Promise<MongoClient>>> = {};
const MIN_NODE_MAJOR = 18;

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

  if (!clients[purpose]) {
    const client = new MongoClient(URIs[purpose], {
      maxPoolSize: 10,
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
