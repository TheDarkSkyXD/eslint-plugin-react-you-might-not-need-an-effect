import { name, rule } from "./rule.js";

// Named export for CJS build and/or eslintrc config
export const rules = {
  [name]: rule,
};
// Default export for ESM and/or flat config
export default { rules };
