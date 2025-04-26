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
                const computeDuringRenderText = `const ${stateVar} = ${argSource};`;

                const isSingleStatementEffectFn =
                  callExpression.parent.type === "ArrowFunctionExpression" ||
                  (callExpression.parent.parent.type === "BlockStatement" &&
                    callExpression.parent.parent.body.length === 1 &&
                    callExpression.parent.parent.body[0] ===
                      callExpression.parent);

                const computeStateFix = isSingleStatementEffectFn
                  ? // The setState call is the only statement in the effect, so we can entirely replace it
                    [fixer.replaceText(node.parent, computeDuringRenderText)]
                  : [
                      // Insert the computed state just before the `useEffect`.
                      // Location is important - we know its dependencies have been declared by this point
                      // because they were used in the `useEffect`.
                      // That may not be the case if we replaced the higher-up `useState` variable.
                      fixer.insertTextBefore(
                        node.parent,
                        `${computeDuringRenderText}\n`,
                      ),
                      // Remove the setState call from the `useEffect`, but keep the rest
                      fixer.remove(callExpression.parent),
                    ];

                return [...computeStateFix, fixer.remove(stateDeclNode.parent)];
              },
            });
          }
        });
      },
    };
  },
};
