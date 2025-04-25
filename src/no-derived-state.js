import {
  isUseState,
  isUseEffect,
  getUseEffectFn,
  getEffectFnCallExpressions,
} from "./util.js";

export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow setting derived state from props or other state in a useEffect.",
      url: "https://react.dev/learn/you-might-not-need-an-effect",
    },
    fixable: "code",
    messages: {
      avoidDerivedState:
        'Avoid storing derived state. Compute "{{state}}" directly from other props or state during render, optionally with `useMemo` if the computation is expensive.',
    },
  },
  create: (context) => {
    const stateSetters = new Map(); // state variable -> setter name
    const stateNodes = new Map(); // state name -> node of the useState variable declarator

    return {
      // Collect `useState`s
      VariableDeclarator(node) {
        if (!isUseState(node)) return;

        const [state, setter] = node.id.elements;
        if (state?.type === "Identifier" && setter?.type === "Identifier") {
          stateSetters.set(setter.name, state.name);
          stateNodes.set(state.name, node);
        }
      },

      // Check `useEffect` for `useState` setters
      CallExpression(node) {
        if (!isUseEffect(node) || node.arguments.length < 1) return;

        const effectFn = getUseEffectFn(node);
        if (!effectFn) return;

        getEffectFnCallExpressions(effectFn)?.forEach((callExpression) => {
          const callee = callExpression.callee;
          if (callee.type === "Identifier" && stateSetters.has(callee.name)) {
            const stateVar = stateSetters.get(callee.name);
            const stateDeclNode = stateNodes.get(stateVar);

            context.report({
              node: callee,
              messageId: "avoidDerivedState",
              data: { state: stateSetters.get(callee.name) },
              // TODO: Replaces `useState` with the computed state, at which point the dependencies
              // may not have been declared. It should replace the `useEffect` instead (whitespace is annoying).
              fix: (fixer) => {
                const setStateArgs = callExpression.arguments;
                const argSource = context
                  .getSourceCode()
                  .getText(setStateArgs[0]);

                return [
                  // Compute state during render,
                  // replacing `const [foo, setFoo] = useState(...)`
                  // TODO: presumably breaks when `setStateArgs` is a function
                  fixer.replaceText(
                    stateDeclNode.parent,
                    `const ${stateVar} = ${argSource};`,
                  ),
                  callExpression.parent.type === "ArrowFunctionExpression"
                    ? // It's a one-liner; remove the entire `useEffect`
                      fixer.remove(node.parent)
                    : callExpression.parent.parent.type === "BlockStatement" &&
                        callExpression.parent.parent.body.length > 1
                      ? // It's a multi-statement body; remove the setter call
                        fixer.remove(callExpression.parent)
                      : // It's the only statement in the body; remove the entire `useEffect`
                        fixer.remove(node.parent),
                ];
              },
            });
          }
        });
      },
    };
  },
};
