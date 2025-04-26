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
              fix: (fixer) => {
                const setStateArgs = callExpression.arguments;
                const argSource = context
                  .getSourceCode()
                  .getText(setStateArgs[0]);

                // TODO: presumably breaks when `setStateArgs` is a function
                const removeStateFix = fixer.remove(stateDeclNode.parent);

                const computeDuringRenderText = `const ${stateVar} = ${argSource};`;
                let computeStateFix = [];
                if (callExpression.parent.type === "ArrowFunctionExpression") {
                  // It's a one-liner; replace the entire `useEffect` with computed state
                  computeStateFix = [
                    fixer.replaceText(node.parent, computeDuringRenderText),
                  ];
                } else if (
                  callExpression.parent.parent.type === "BlockStatement"
                ) {
                  if (
                    callExpression.parent.parent.body.length === 1 &&
                    callExpression.parent.parent.body[0] ===
                      callExpression.parent
                  ) {
                    // It's the only statement in the body; replace the entire `useEffect` with computed state
                    computeStateFix = [
                      fixer.replaceText(node.parent, computeDuringRenderText),
                    ];
                  } else {
                    computeStateFix = [
                      // Add the computed state right above the `useEffect`
                      // We place it at the `useEffect` location because we know
                      // its dependencies have been declared by that point.
                      // If we replaced the `useState` location, they may not be.
                      fixer.insertTextBefore(
                        node.parent,
                        `${computeDuringRenderText}\n`,
                      ),
                      // It's a multi-statement body; remove the setter call
                      fixer.remove(callExpression.parent),
                    ];
                  }
                }

                return [...computeStateFix, removeStateFix];
              },
            });
          }
        });
      },
    };
  },
};
