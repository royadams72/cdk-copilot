/** @type {import('next').NextConfig} */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load from repo root (../../ relative to this file)
const rootEnv = dotenv.config({ path: resolve(__dirname, "../../.env") });
dotenvExpand.expand(rootEnv);

const rootEnvLocal = dotenv.config({
  path: resolve(__dirname, "../../.env.local"),
});
dotenvExpand.expand(rootEnvLocal);

const nextConfig = {
  transpilePackages: ["@ckd/core"],
};

export default nextConfig;
