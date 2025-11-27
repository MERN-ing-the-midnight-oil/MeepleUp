// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Increase memory limit for large JSON files
config.transformer = {
  ...config.transformer,
  // Increase max worker memory for large files
  maxWorkers: 2,
};

// Configure resolver to handle large JSON files
config.resolver = {
  ...config.resolver,
  // Ensure JSON files are properly resolved
  sourceExts: [...(config.resolver?.sourceExts || []), 'json'],
};

// Increase serializer memory limits
config.serializer = {
  ...config.serializer,
  // Allow larger chunks
  createModuleIdFactory: config.serializer?.createModuleIdFactory,
};

module.exports = config;






