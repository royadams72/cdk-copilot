// lib/mongo.ts
import { MongoClient } from "mongodb";

type Purpose = "app" | "analytics" | "migrations";
const URIs: Record<Purpose, string> = {
  app: process.env.MONGODB_URI_APP!,
  analytics: process.env.MONGODB_URI_ANALYTICS_RO!,
  migrations: process.env.MONGODB_URI_MIGRATIONS!, // never used in prod runtime
};

const clients: Partial<Record<Purpose, Promise<MongoClient>>> = {};

export function getClient(purpose: Purpose = "app") {
  if (!clients[purpose]) {
    const client = new MongoClient(URIs[purpose], {
      maxPoolSize: 10,
      retryWrites: true,
    });
    clients[purpose] = client.connect();
  }
  return clients[purpose]!;
}

export async function getDb(purpose: Purpose = "app", dbName = "ckd-copilot") {
  const client = await getClient(purpose);
  return client.db(dbName);
}
