module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Drizzle's generated migrations import .sql files as strings (src/db/migrations).
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
