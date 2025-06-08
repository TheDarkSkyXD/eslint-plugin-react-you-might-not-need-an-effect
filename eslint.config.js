import eslint from "@eslint/js";
import eslintPlugin from "eslint-plugin-eslint-plugin";
import nodePlugin from "eslint-plugin-n";
import globals from "globals";

export default [
  eslint.configs.recommended,
  eslintPlugin.configs["flat/recommended"],
  nodePlugin.configs["flat/recommended"],
  {
    ignores: ["dist/**", "node_modules/**", ".yarn/**"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["test/**"],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
  },
];
