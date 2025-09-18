const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// watch shared packages (without nuking Expo defaults)
config.watchFolders = [
  ...(config.watchFolders || []),
  path.join(workspaceRoot, "packages"),
];

// resolve hoisted deps + allow pnpm symlinks
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;

// handy aliases
config.resolver.alias = {
  "@": path.resolve(projectRoot),
  networking: path.resolve(workspaceRoot, "packages/networking/src"),
};

module.exports = config;
