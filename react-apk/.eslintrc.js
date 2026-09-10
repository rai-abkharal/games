module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Fire-and-forget promises are deliberate in the services layer.
    'no-void': ['warn', { allowAsStatement: true }],
  },
  overrides: [
    {
      files: ['src/utils/*.ts'],
      rules: { 'no-bitwise': 'off' },
    },
  ],
};
