import assert from "assert";
import { RuleTester } from "eslint";
import plugin from "../src/index.js";

// For syntax highlighting inside code under test
export const js = String.raw;

export class MyRuleTester extends RuleTester {
  constructor(options) {
    super({
      ...options,
      languageOptions: plugin.configs.recommended.languageOptions,
    });
  }

  run(variation, tests) {
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

      const { valid = [], invalid = [] } = tests;

      [...valid, ...invalid]
        .filter((test) => test.todo)
        .forEach((test) => {
          it.skip(test.name);
        });

      const filteredTests = {
        valid: valid.filter((test) => !test.todo),
        invalid: invalid.filter((test) => !test.todo),
      };

      super.run(
        plugin.meta.name + variation,
        plugin.rules["you-might-not-need-an-effect"],
        filteredTests,
      );
    } finally {
      // Restore the original strictEqual function to avoid unintended effects
      assert.strictEqual = originalStrictEqual;
    }
  }
}

const normalizeWhitespace = (str) =>
  typeof str === "string" ? str.replace(/\s+/g, " ").trim() : str;
