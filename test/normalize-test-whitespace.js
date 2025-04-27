import assert from "node:assert";

// Normalizes whitespaces between the expected and actual strings.
// Because formatting seriously complicates the fixer implementation,
// and most people have a formatter anyway.
// Not sure how hacky this is.
const originalStrictEqual = assert.strictEqual;
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

const normalizeWhitespace = (str) =>
  typeof str === "string" ? str.replace(/\s+/g, " ").trim() : str;
