// Uses the app's own copy of the shared code (src/core), so the app builds on its own in Expo's cloud.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const config = getDefaultConfig(__dirname);
config.resolver.extraNodeModules = { '@cydras/core': path.join(__dirname, 'src/core') };
module.exports = config;
