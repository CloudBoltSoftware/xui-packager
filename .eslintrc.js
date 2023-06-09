module.exports = {
  root: true,
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  env: { node: true, es6: true },
  extends: ['eslint:recommended', 'prettier'],
  ignorePatterns: ['node_modules']
}
