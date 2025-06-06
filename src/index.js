import { name as ruleName, rule } from "./rule.js";
import globals from "globals";

const pluginName = "react-you-might-not-need-an-effect";

const plugin = {
  meta: {
    name: pluginName,
  },
  configs: {
    recommended: {},
  },
  rules: {
    [ruleName]: rule,
  },
};

Object.assign(plugin.configs.recommended, {
  files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
  plugins: {
    // Object.assign above so we can reference `plugin` here
    [pluginName]: plugin,
  },
  rules: {
    [pluginName + "/" + ruleName]: "warn",
  },
  languageOptions: {
    globals: {
      // NOTE: Required so we can resolve global references to their upstream global variables
      ...globals.browser,
    },
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

export default plugin;
