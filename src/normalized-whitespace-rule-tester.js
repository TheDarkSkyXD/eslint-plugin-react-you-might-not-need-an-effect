import { RuleTester } from "eslint";
import assert from "node:assert";

const normalizeWhitespace = (str) =>
  typeof str === "string" ? str.replace(/\s+/g, " ").trim() : str;

// Normalizes whitespaces between the expected and actual strings.
// Because formatting seriously complicates the fixer implementation,
// and most people have a formatter anyway.
// Not sure how hacky this is.
export class NormalizedWhitespaceRuleTester extends RuleTester {
  run(name, rule, tests) {
    const originalStrictEqual = assert.strictEqual;

    try {
      // Patch assert.strictEqual temporarily
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

      // Now call the original run method with the patched assert
      super.run(name, rule, tests);
    } finally {
      // Always restore the original assert after running
      assert.strictEqual = originalStrictEqual;
    }
  }
}
