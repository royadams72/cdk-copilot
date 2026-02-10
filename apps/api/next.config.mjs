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

  serverExternalPackages: ["mongodb", "bson"],

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Tell webpack not to bundle/resolve optional native deps
      const externalsMap = {
        kerberos: "commonjs kerberos",
        snappy: "commonjs snappy",
        "@mongodb-js/zstd": "commonjs @mongodb-js/zstd",
        socks: "commonjs socks",
        aws4: "commonjs aws4",
        "gcp-metadata": "commonjs gcp-metadata",
        "mongodb-client-encryption": "commonjs mongodb-client-encryption",
        "@aws-sdk/credential-providers":
          "commonjs @aws-sdk/credential-providers",
      };
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, externalsMap]
        : [config.externals, externalsMap].filter(Boolean);
    }
    return config;
  },
};

export default nextConfig;
