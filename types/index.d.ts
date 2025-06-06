import type { ESLint } from "eslint";

declare const plugin: ESLint.Plugin & {
  configs: {
    recommended: ESLint.ConfigData;
  };
};
export default plugin;
