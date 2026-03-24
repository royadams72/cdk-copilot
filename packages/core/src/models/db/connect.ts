import mongoose from "mongoose";

function getMongoUri() {
  const { MONGODB_URI_APP = "" } = process.env;
  if (!MONGODB_URI_APP) throw new Error("MONGODB_URI_APP is not set");
  return MONGODB_URI_APP;
}

declare global {
  // allow global caching in dev/hot reload
  // eslint-disable-next-line no-var
  var __mongooseConn: Promise<typeof mongoose> | undefined;
}

export function connectMongo() {
  if (!global.__mongooseConn) {
    global.__mongooseConn = mongoose.connect(getMongoUri(), {
      // keep defaults sane; add options if needed
      // dbName: "ckd",
      // maxPoolSize: 5,
    });
  }
  return global.__mongooseConn;
}
