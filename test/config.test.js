import { ESLint } from "eslint";
import plugin from "../src/index.js";
import assert from "assert";
import { js } from "./rule-tester.js";
import { LegacyESLint } from "eslint/use-at-your-own-risk";

describe("Recommended config", () => {
  const code = js`
    import { useState, useEffect } from "react";

    const MyComponent = () => {
      const [state, setState] = useState(0);
      const [otherState, setOtherState] = useState(0);

      useEffect(() => {
        setState(otherState * 2);
      }, [state]);
    };
  `;

  const testCases = [
    {
      name: "Flat",
      eslint: new ESLint({
        // Use `overrideConfig` so it ignores the project's config
        overrideConfig: [plugin.configs.recommended],
      }),
    },
    {
      name: "Legacy",
      eslint: new LegacyESLint({
        overrideConfig: {
          extends: [
            "plugin:react-you-might-not-need-an-effect/legacy-recommended",
          ],
          parserOptions: {
            // To support the syntax in the code under test
            ecmaVersion: 2020,
            sourceType: "module",
          },
        },
      }),
    },
  ];

  testCases.forEach(({ name, eslint }) => {
    it(name, async () => {
      const results = await eslint.lintText(code);

      assert.strictEqual(results.length, 1);
      assert.ok(results[0].messages);
      assert.ok(
        results[0].messages.some(
          (message) =>
            message.ruleId ===
            "react-you-might-not-need-an-effect/you-might-not-need-an-effect",
        ),
      );
    });
  });
});
