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
    schema: [],
    messages: {
      avoidDerivedState:
        'Avoid storing derived state. Compute "{{state}}" directly during render, optionally with `useMemo` if it\'s expensive.',
      avoidPassingIntermediateDataToParent:
        "Avoid making parent components depend on a child's intermediate state. If the parent needs live updates, consider lifting state up.",
      avoidDelayedSideEffect:
        "Avoid using useEffect to trigger side effects in response to state changes. When possible, use direct callbacks (like `onCompleted`) instead. If no callback exists, reacting to state may be necessary.",
    },
  },
  create: (context) => {
    let useStates; // Map of setter name -> { stateName, node }
    let propsNames; // Set of prop names

    const setupComponentScope = (param) => {
      useStates = new Map();
      propsNames = new Set();

      if (!param) return;
      getPropsNames(param).forEach((name) => {
        propsNames.add(name);
      });
    };

    return {
      FunctionDeclaration: (node) => {
        if (isReactFunctionalComponent(node)) {
          setupComponentScope(node.params[0]);
        }
      },
      VariableDeclarator: (node) => {
        if (isReactFunctionalComponent(node)) {
          setupComponentScope(node.init.params[0]);
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
          const isPropCallback = propsNames.has(getBaseName(callee));

          if (depInArgs && isStateSetterCall) {
            const { stateName } = useStates.get(callExpr.callee.name);
            context.report({
              node: callExpr.callee,
              messageId: "avoidDerivedState",
              data: { state: stateName },
            });
          } else if (
            isPropCallback &&
            depInArgs &&
            // The rule is only meant to prevent passing *intermediate* state.
            // Passing *final* state, like when the user completes a form, is a valid use case.
            // So we check the callback name as a heuristic.
            // It's also intentional that we then proceed to the check for delayed side effects;
            // in the form example, that's the correct warning to give.
            !allowedPropsCallbacks.includes(getBaseName(callee))
          ) {
            context.report({
              node: callExpr.callee,
              messageId: "avoidPassingIntermediateDataToParent",
            });
          } else if (depsNodes.length > 0) {
            // We're calling a side effect in response to a state change.
            // WARNING: This case can't always be fixed.
            // It requires that the state we're reacting to has an equivalent callback.
            // e.g. `onCompleted` instead of reacting to `data` changing.
            // But some libraries only expose state, without callbacks.
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

const allowedPropsCallbacks = ["onSave", "onSubmit"];
