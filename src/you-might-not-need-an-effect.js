import {
  isUseState,
  isUseEffect,
  getUseEffectFn,
  getCallExpressions,
  isReactFunctionalComponent,
  getUseEffectDeps,
  findDepInArgs,
  getPropsNames,
  getBaseName,
  isSingleStatementFn,
} from "./util.js";

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn against unnecessary useEffect.",
      url: "https://react.dev/learn/you-might-not-need-an-effect",
    },
    fixable: "code",
    schema: [],
    messages: {
      // TODO: One of these needs to suggest that state be updated in a callback, rather than a useEffect that monitors state.
      // e.g. using Apollo's `onCompleted` instead of a `useEffect` that reacts to the query result.
      // Maybe in avoidDerivedState? Because it would flag that currently.
      // However it kinda fits avoidDelayedSideEffect too, because the intermediate state (the query result) is used to trigger the event handler (setting other state),
      // when the event handler should be handled directly (in `onCompleted`). Not entirely sure this can be understood in all cases.
      // And some libraries don't offer callbacks, only values, in which case you *have* to react to changes with a useEffect.
      // But generally I think it should be in your control, and you can ignore it when not.
      // I think...?
      // Anyway, how can I tell those apart to give the right suggestion?
      // Maybe check if the callback is a state setter vs anything else?
      // Pretty good chance I need to remove the fixes too. Seems complex to handle correctly, if possible at all.
      avoidDerivedState:
        'Avoid storing derived state. Compute "{{state}}" directly during render, optionally with `useMemo` if it\'s expensive.',
      // TODO: I think this gives false positives sometimes. Like if the child exposes some form UI and
      // then notifies the parent with the results upon completion. Which I think is a valid use case?
      avoidPassingDataToParent:
        'React state should not flow from from children to parents. Consider lifting "{{data}}" into the parent.',
      avoidDelayedSideEffect:
        "Avoid waiting for state changes to trigger side effects in useEffect. When possible, handle the action directly.",
    },
  },
  create: (context) => {
    let useStates; // Map of setter name -> { stateName, node }
    let propsNames; // Set of prop names

    return {
      FunctionDeclaration: (node) => {
        if (isReactFunctionalComponent(node)) {
          useStates = new Map();
          propsNames = new Set();

          const fnParamNode = node.params[0];
          if (!fnParamNode) return;
          getPropsNames(fnParamNode).forEach((name) => {
            propsNames.add(name);
          });
        }
      },
      VariableDeclarator: (node) => {
        if (isReactFunctionalComponent(node)) {
          useStates = new Map();
          propsNames = new Set();

          const fnParamNode = node.init.params[0];
          if (!fnParamNode) return;
          getPropsNames(fnParamNode).forEach((name) => {
            propsNames.add(name);
          });
        } else if (isUseState(node)) {
          const [state, setter] = node.id.elements;
          useStates.set(setter.name, { stateName: state.name, node });
        }
      },

      CallExpression: (node) => {
        if (!isUseEffect(node)) return;
        const effectFn = getUseEffectFn(node);
        const depsNodes = getUseEffectDeps(node);
        if (!effectFn || !depsNodes) return;

        getCallExpressions(
          context,
          context.sourceCode.getScope(effectFn.body),
        ).forEach((callExpr) => {
          const callee = callExpr.callee;
          const depInArgs = findDepInArgs(
            context,
            depsNodes,
            callExpr.arguments,
          );
          const isStateSetterCall =
            callee.type === "Identifier" && useStates.has(callee.name);
          const isPropCallbackCall = propsNames.has(getBaseName(callee));

          if (depInArgs && isStateSetterCall) {
            const { stateName, node: stateDeclNode } = useStates.get(
              callExpr.callee.name,
            );
            context.report({
              node: callExpr.callee,
              messageId: "avoidDerivedState",
              data: { state: stateName },
              fix: (fixer) => {
                const setStateArgs = callExpr.arguments;
                const argSource = context.sourceCode.getText(setStateArgs[0]);
                const computeDuringRenderText = `const ${stateName} = ${argSource};`;

                const computeStateFix = isSingleStatementFn(effectFn)
                  ? // The setState call is the only statement in the effect, so we can entirely replace it
                    [fixer.replaceText(node.parent, computeDuringRenderText)]
                  : [
                      // Remove the setState call from the `useEffect`, but keep the rest
                      fixer.remove(callExpr.parent),
                      // Insert the computed state just before the `useEffect`.
                      // Location is important - we know its dependencies have been declared by this point
                      // because they were used in the `useEffect`.
                      // That may not be the case if we replaced the higher-up `useState` node.
                      fixer.insertTextBefore(
                        node.parent,
                        `${computeDuringRenderText}\n`,
                      ),
                    ];

                return [...computeStateFix, fixer.remove(stateDeclNode.parent)];
              },
            });
          } else if (depInArgs && isPropCallbackCall) {
            context.report({
              node: callExpr.callee,
              messageId: "avoidPassingDataToParent",
              data: { data: getBaseName(depInArgs) },
            });
          } else if (depInArgs) {
            // We're calling a side effect, like making an API call
            context.report({
              node: callExpr.callee,
              messageId: "avoidDelayedSideEffect",
            });
          }
        });
      },
    };
  },
};
