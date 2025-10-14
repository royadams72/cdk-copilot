import path from "node:path";
import { config as dotenv } from "dotenv";
import { expand } from "dotenv-expand";

expand(dotenv({ path: path.resolve(__dirname, "../../.env") }));
// Optionally also load .env.local if present at root:
expand(dotenv({ path: path.resolve(__dirname, "../../.env.local") }));

/** @type {import('next').NextConfig} */
const nextConfig = { transpilePackages: ["@ckd/core"] };
export default nextConfig;
