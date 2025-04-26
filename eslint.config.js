import pkg from "eslint-plugin-eslint-plugin";
const { configs } = pkg;

export default [
  configs["flat/recommended"],
  {
    rules: {},
  },
];
