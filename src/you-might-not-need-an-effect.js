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
      avoidDerivedState:
        'Avoid storing derived state. Compute "{{state}}" directly from other props or state during render, optionally with `useMemo` if the computation is expensive.',
      avoidPassingDataToParent:
        'React state should not flow from from children to parents. Consider lifting "{{data}}" into the parent.',
      avoidEventHandler:
        'Avoid calling an event handler in a useEffect. Instead, call "{{handlerFn}}" directly.',
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
          }
        });
      },
    };
  },
};
