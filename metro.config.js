const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const SRC = path.resolve(__dirname, 'src');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // "@/x" -> "<root>/src/x". Mirrors `paths` in tsconfig.json and
    // `moduleNameMapper` in jest.config.js.
    resolveRequest: (context, moduleName, platform) => {
      const target = moduleName.startsWith('@/')
        ? path.join(SRC, moduleName.slice(2))
        : moduleName;
      return context.resolveRequest(context, target, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
