// Only used by Jest; Vite builds the app with its own React plugin.
module.exports = (api) => {
  if (!api.env('test')) return {};
  return {
    presets: [
      ['@babel/preset-env', { targets: { node: 'current' } }],
      ['@babel/preset-react', { runtime: 'automatic' }],
      '@babel/preset-typescript',
    ],
    // Jest runs CommonJS, which has no import.meta; this maps import.meta.env to process.env
    plugins: ['babel-plugin-transform-vite-meta-env'],
  };
};
