import {
  isUseState,
  isUseEffect,
  getUseEffectFn,
  getEffectFnCallExpressions,
  isReactComponent,
  getUseEffectDeps,
  findDepUsedInArgs,
  getPropsNames,
  getBaseName,
} from "./util.js";

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow unnecessary useEffect.",
      url: "https://react.dev/learn/you-might-not-need-an-effect",
    },
    fixable: "code",
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
      FunctionDeclaration(node) {
        if (isReactComponent(node)) {
          useStates = new Map();
          propsNames = new Set();

          const fnParamNode = node.params[0];
          if (!fnParamNode) return;
          getPropsNames(fnParamNode).forEach((name) => {
            propsNames.add(name);
          });
        }
      },
      VariableDeclarator(node) {
        if (isReactComponent(node)) {
          useStates = new Map();
          propsNames = new Set();

          const fnParamNode = node.init.params[0];
          if (!fnParamNode) return;
          getPropsNames(fnParamNode).forEach((name) => {
            propsNames.add(name);
          });
        } else if (isUseState(node)) {
          const [state, setter] = node.id.elements;
          if (state?.type === "Identifier" && setter?.type === "Identifier") {
            useStates.set(setter.name, { stateName: state.name, node });
          }
        }
      },

      CallExpression(node) {
        if (!isUseEffect(node)) return;
        const effectFn = getUseEffectFn(node);
        const depsNodes = getUseEffectDeps(node);
        if (!effectFn || !depsNodes) return;

        getEffectFnCallExpressions(effectFn)
          ?.filter(
            (callExpr) =>
              // It calls a state setter
              callExpr.callee.type === "Identifier" &&
              useStates.has(callExpr.callee.name) &&
              // The set value is derived from the dependencies
              findDepUsedInArgs(context, depsNodes, callExpr.arguments) !==
                undefined,
          )
          .forEach((callExpr) => {
            const { stateName, node: stateDeclNode } = useStates.get(
              callExpr.callee.name,
            );
            context.report({
              node: callExpr.callee,
              messageId: "avoidDerivedState",
              data: { state: stateName },
              fix: (fixer) => {
                const setStateArgs = callExpr.arguments;
                const argSource = context
                  .getSourceCode()
                  .getText(setStateArgs[0]);
                const computeDuringRenderText = `const ${stateName} = ${argSource};`;

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

        getEffectFnCallExpressions(effectFn)
          // Only check calls to props
          ?.filter(
            ({ callee }) =>
              // Destructured prop
              (callee.type === "Identifier" && propsNames.has(callee.name)) ||
              // Field access on non-destructured prop
              (callee.type === "MemberExpression" &&
                callee.object.type === "Identifier" &&
                propsNames.has(callee.object.name)),
          )
          .forEach((callExpr) => {
            const propCallbackArgs = callExpr.arguments;
            const propCallbackArgFromDeps = findDepUsedInArgs(
              context,
              depsNodes,
              propCallbackArgs,
            );

            if (propCallbackArgFromDeps) {
              context.report({
                node: callExpr.callee,
                messageId: "avoidPassingDataToParent",
                data: {
                  data: getBaseName(propCallbackArgFromDeps),
                },
              });
            }
          });
      },
    };
  },
};
