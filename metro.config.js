const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

// Native build scratch dirs (CMake temps, Gradle/Xcode output) are created and
// deleted constantly during a build. Without watchman, Metro's fallback watcher
// crashes the whole process when one disappears mid-watch (ENOENT on .cxx).
// Nothing in them is ever bundled, so keep them out of the file map entirely.
const config = {
  resolver: {
    blockList: [
      ...[].concat(defaultConfig.resolver.blockList || []),
      /[/\\]\.cxx[/\\].*/,
      /[/\\]android[/\\]build[/\\].*/,
      /[/\\]android[/\\]\.gradle[/\\].*/,
      /[/\\]ios[/\\]build[/\\].*/,
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
