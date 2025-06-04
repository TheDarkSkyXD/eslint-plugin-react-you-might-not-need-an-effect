import eslintPlugin from "eslint-plugin-eslint-plugin";
import nodePlugin from "eslint-plugin-n";

export default [
  eslintPlugin.configs["flat/recommended"],
  nodePlugin.configs["flat/recommended"],
  {
    ignores: ["dist/**", "node_modules/**", ".yarn/**"],
  },
];
