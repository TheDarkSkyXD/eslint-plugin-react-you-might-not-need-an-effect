# `eslint-plugin-react-you-might-not-need-an-effect`

ESLint plugin to catch [unnecessary React `useEffect`s](https://react.dev/learn/you-might-not-need-an-effect) to make your code easier to follow, faster to run, and less error-prone. Highly recommended for new React developers as you learn its mental model, and even experienced developers may be surprised.

## 🚀 Installation

This plugin requires ESLint >= v7.0.0 and Node >= 14.

```bash
npm install --save-dev eslint-plugin-react-you-might-not-need-an-effect
```

## 🔧 Usage

Add the plugin to your ESLint configuration file.

### Legacy config (`.eslintrc`)

```js
{
  "plugins": ["react-you-might-not-need-an-effect"],
  "rules": {
    "react-you-might-not-need-an-effect/you-might-not-need-an-effect": "warn"
  }
}
```

### Flat config (`eslint.config.js`)

```js
import youMightNotNeedAnEffect from "eslint-plugin-react-you-might-not-need-an-effect";

export default [
  {
    files: ["**/*.{js,jsx}"],
    plugins: {
      "react-you-might-not-need-an-effect": youMightNotNeedAnEffect,
    },
    rules: {
      "react-you-might-not-need-an-effect/you-might-not-need-an-effect": "warn",
    },
  },
];

```

This plugin assumes that your effects receive correct dependencies. Thus the [`eslint-plugin-react-hooks`](https://www.npmjs.com/package/eslint-plugin-react-hooks)`/exhaustive-deps` rule is also recommended.

## 🔎 Rule: `you-might-not-need-an-effect`

Warns when an effect is likely unnecessary, such as when it:

- Only uses internal state or props
- Derives or chains state updates
- Initializes state
- Resets all state when props change
- Passes data to the parent
- Manages parent behavior

While the effect may be unnecessary, we cannot reliably warn when it:

- Uses internal state to handle events
- Uses external state
- Calls external functions

Some cases are complex and nuanced. This plugin attempts to minimize false positives and accepts inevitable false negatives. But please open an issue if you experience either!

## 📖 Learn More

- https://react.dev/reference/react/useEffect
- https://react.dev/learn/you-might-not-need-an-effect
- https://react.dev/learn/synchronizing-with-effects
- https://react.dev/learn/separating-events-from-effects
- https://react.dev/learn/lifecycle-of-reactive-effects
