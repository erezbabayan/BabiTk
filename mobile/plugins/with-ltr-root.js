// Hebrew screens are authored right-to-left on an LTR root (same as the web).
// Disable Android's RTL mirroring so a Hebrew device locale does not flip them again.
const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withLtrRoot(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      app.$ = app.$ ?? {};
      app.$["android:supportsRtl"] = "false";
    }
    return cfg;
  });
};
