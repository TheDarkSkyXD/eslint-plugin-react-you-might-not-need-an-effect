# ESLint - React - You Might Not Need An Effect

ESLint plugin to catch [unnecessary React `useEffect`s](https://react.dev/learn/you-might-not-need-an-effect) to make your code easier to follow, faster to run, and less error-prone. Highly recommended for new React developers as you learn its mental model, and even experienced developers may be surprised.

## 🚀 Setup

This plugin requires ESLint >= v7.0.0 and Node >= 14.

### Installation

**NPM**:

```bash
npm install --save-dev eslint-plugin-react-you-might-not-need-an-effect
```

**Yarn**:

```bash
yarn add -D eslint-plugin-react-you-might-not-need-an-effect
```

### Configuration

Add the plugin to your ESLint configuration file.

#### Legacy config (`.eslintrc`)

```js
{
  "plugins": ["react-you-might-not-need-an-effect"],
  "rules": {
    "react-you-might-not-need-an-effect/you-might-not-need-an-effect": "warn"
  }
}
```

#### Flat config (`eslint.config.js`)

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

### Recommended

The plugin will have more information to act upon when you:

- Configure your [ESLint global variables](https://eslint.org/docs/latest/use/configure/language-options#predefined-global-variables)
- Pass the correct dependencies to your effect — [`react-hooks/exhaustive-deps`](https://www.npmjs.com/package/eslint-plugin-react-hooks)

## 🔎 Rule: `you-might-not-need-an-effect`

Determines when an effect is likely unnecessary, such as when it:

- Only uses internal state or props
- Derives or chains state updates
- Initializes state
- Resets all state when props change
- Couples parent and child state or behavior

When possible, also suggests the more idiomatic pattern.

While the effect may be unnecessary, we cannot reliably determine that when it:

- Uses external state
- Calls external functions
- Uses internal state to handle events

## ⚠️ Limitations

This plugin aims to minimize false positives and accepts that some false negatives are inevitable — see the [tests](./test) for (in)valid examples. But the ways to (mis)use an effect are practically endless; if you encounter unexpected behavior or edge cases in real-world usage, please [open an issue](https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/issues/new) with details about your scenario. Your feedback helps improve the plugin for everyone!

## 📖 Learn More

- https://react.dev/reference/react/useEffect
- https://react.dev/learn/you-might-not-need-an-effect
- https://react.dev/learn/synchronizing-with-effects
- https://react.dev/learn/separating-events-from-effects
- https://react.dev/learn/lifecycle-of-reactive-effects
