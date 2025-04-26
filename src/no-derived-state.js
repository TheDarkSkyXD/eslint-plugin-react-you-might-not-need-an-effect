import {
  isUseState,
  isUseEffect,
  getUseEffectFn,
  getEffectFnCallExpressions,
  isReactComponent,
  getUseEffectDeps,
  findDepUsedInArgs,
} from "./util.js";

// Covers:
// - https://react.dev/learn/you-might-not-need-an-effect#updating-state-based-on-props-or-state
// - meow
// - https://react.dev/learn/you-might-not-need-an-effect#updating-state-based-on-props-or-state
//   - TODO: Could provide separate suggestion/fix with `useMemo`
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
    let stateSetters; // state variable -> setter name
    let stateNodes; // state name -> node of the useState variable declarator

    return {
      // Scope state per component
      FunctionDeclaration(node) {
        if (!isReactComponent(node)) return;
        stateSetters = new Map();
        stateNodes = new Map();
      },
      VariableDeclarator(node) {
        if (!isReactComponent(node)) return;
        stateSetters = new Map();
        stateNodes = new Map();
      },

      // Collect `useState`s
      VariableDeclarator(node) {
        if (!isUseState(node)) return;

        const [state, setter] = node.id.elements;
        if (state?.type === "Identifier" && setter?.type === "Identifier") {
          stateSetters.set(setter.name, state.name);
          stateNodes.set(state.name, node);
        }
      },

      // Check `useEffect` for `useState` setters that are derived from dependencies
      CallExpression(node) {
        if (!isUseEffect(node) || node.arguments.length < 1) return;

        const effectFn = getUseEffectFn(node);
        const depsNodes = getUseEffectDeps(node);
        if (!effectFn || !depsNodes) return;

        getEffectFnCallExpressions(effectFn)
          ?.filter(
            (callExpr) =>
              // It calls a state setter
              callExpr.callee.type === "Identifier" &&
              stateSetters.has(callExpr.callee.name) &&
              // The set value is derived from the dependencies
              findDepUsedInArgs(context, depsNodes, callExpr.arguments) !==
                undefined,
          )
          .forEach((callExpr) => {
            const stateVar = stateSetters.get(callExpr.callee.name);
            const stateDeclNode = stateNodes.get(stateVar);

            context.report({
              node: callExpr.callee,
              messageId: "avoidDerivedState",
              data: { state: stateSetters.get(callExpr.callee.name) },
              fix: (fixer) => {
                const setStateArgs = callExpr.arguments;
                const argSource = context
                  .getSourceCode()
                  .getText(setStateArgs[0]);
                const computeDuringRenderText = `const ${stateVar} = ${argSource};`;

                const isSingleStatementEffectFn =
                  callExpr.parent.type === "ArrowFunctionExpression" ||
                  (callExpr.parent.parent.type === "BlockStatement" &&
                    callExpr.parent.parent.body.length === 1 &&
                    callExpr.parent.parent.body[0] === callExpr.parent);

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
                      fixer.remove(callExpr.parent),
                    ];

                return [...computeStateFix, fixer.remove(stateDeclNode.parent)];
              },
            });
          });
      },
    };
  },
};
