const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const mobileModules = path.resolve(projectRoot, "node_modules");
const convexRoot = path.resolve(mobileModules, "convex");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  mobileModules,
  path.resolve(workspaceRoot, "node_modules"),
];
// Alias only. A global disableHierarchicalLookup breaks nested RN packages
// such as @react-native/virtualized-lists under react-native/node_modules.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  convex: convexRoot,
};

const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "convex" || moduleName.startsWith("convex/")) {
    return (resolve ?? context.resolveRequest)(
      {
        ...context,
        originModulePath: path.join(projectRoot, "package.json"),
        disableHierarchicalLookup: true,
        nodeModulesPaths: [mobileModules],
      },
      moduleName,
      platform,
    );
  }
  if (resolve) return resolve(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
