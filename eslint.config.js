const js = require("@eslint/js");

const commonGlobals = {
  Buffer: "readonly", URL: "readonly", URLSearchParams: "readonly", console: "readonly",
  crypto: "readonly", fetch: "readonly", FormData: "readonly", setTimeout: "readonly",
  clearTimeout: "readonly", setInterval: "readonly", structuredClone: "readonly", AbortSignal: "readonly",
  document: "readonly", localStorage: "readonly", btoa: "readonly", MutationObserver: "readonly", Blob: "readonly"
};

module.exports = [
  { ignores: ["node_modules/**", "data/**", "backups/**", "test-results/**", "playwright-report/**"] },
  js.configs.recommended,
  {
    files: ["server/**/*.js", "scripts/**/*.js", "test/**/*.js", "browser-tests/**/*.js", "server.js", "playwright.config.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "commonjs", globals: { ...commonGlobals, require: "readonly", module: "readonly", process: "readonly", __dirname: "readonly" } }
  },
  {
    files: ["public/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: { ...commonGlobals, window: "readonly", document: "readonly", navigator: "readonly", location: "readonly", history: "readonly", HTMLElement: "readonly", FileReader: "readonly", Image: "readonly", Option: "readonly", confirm: "readonly", alert: "readonly", requestAnimationFrame: "readonly", Blob: "readonly" } }
  },
  {
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^(?:_|message$)", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^error$" }],
      "no-empty": "off",
      "no-control-regex": "off",
      "no-constant-binary-expression": "error",
      "no-unsafe-finally": "error",
      "no-useless-catch": "error"
    }
  }
];
