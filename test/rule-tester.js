import assert from "node:assert";
import { RuleTester } from "eslint";

// Normalizes whitespaces between the expected and actual `output` for tests with fixes.
// Because formatting seriously complicates the fixer implementation and most people have a formatter anyway.
// Not sure how hacky this is.
// Seems like it might be standard practice for ESLint plugins?
// Even the TS ESLint plugin mentions that it does not concern itself with formatting.
class NormalizedWhitespaceRuleTester extends RuleTester {
  constructor(options) {
    super(options);
  }

  run(ruleName, rule, tests) {
    const originalStrictEqual = assert.strictEqual;
    try {
      assert.strictEqual = (actual, expected, ...rest) => {
        if (typeof actual === "string" && typeof expected === "string") {
          return originalStrictEqual(
            normalizeWhitespace(actual),
            normalizeWhitespace(expected),
            ...rest,
          );
        }
        return originalStrictEqual(actual, expected, ...rest);
      };

      super.run(ruleName, rule, tests);
    } finally {
      // Restore the original strictEqual function to avoid unintended effects
      assert.strictEqual = originalStrictEqual;
    }
  }
}

const normalizeWhitespace = (str) =>
  typeof str === "string" ? str.replace(/\s+/g, " ").trim() : str;

export const ruleTester = new NormalizedWhitespaceRuleTester({
  languageOptions: {
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});
