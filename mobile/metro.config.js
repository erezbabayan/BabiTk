const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const mobileModules = path.resolve(projectRoot, "node_modules");

const config = getDefaultConfig(projectRoot);

// The app imports pure TS helpers from ../shared, so watch the repo root.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  mobileModules,
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
