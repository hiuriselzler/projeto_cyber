const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle's generated migrations are .sql files, bundled as strings.
config.resolver.sourceExts.push('sql');

module.exports = config;
