# eslint-plugin-react-you-might-not-need-an-effect

ESLint rule to warn against [unnecessary React `useEffect`](https://react.dev/learn/you-might-not-need-an-effect) to make your code easier to follow, faster to run, and less error-prone.

Some cases are complex and nuanced, and difficult to properly detect. This plugin attempts to minimize false positives and accepts inevitable false negatives. But please open an issue if you experience either.

This plugin requires that you pass an accurate `dependencies` array to your `useEffect`s. Thus the `eslint-plugin-react-hooks/exhaustive-deps` rule is also recommended.
