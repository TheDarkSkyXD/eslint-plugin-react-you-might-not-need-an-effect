import {
  isUseState,
  isUseEffect,
  getUseEffectFn,
  getCallExpressions,
  isReactFunctionalComponent,
  getUseEffectDeps,
  findReference,
  getPropsNames,
  getBaseName,
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
      // Overall warning
      avoidInternalEffect:
        "This effect operates entirely on internal React state, with no external dependencies. It is likely unnecessary.",
      // State setter warnings
      avoidDerivedState:
        'Avoid storing derived state. Compute "{{state}}" directly during render, optionally with `useMemo` if it\'s expensive.',
      avoidInitializingState:
        "Avoid initializing state in an effect. Instead, pass the initial value to `useState`.",
      avoidChainingState:
        "Avoid chaining state changes. When possible, update all relevant state simultaneously.",
      // Prop callback warnings
      avoidPassingIntermediateDataToParent:
        "Avoid making parent components depend on a child's intermediate state. If the parent needs live updates, consider lifting state up.",

      // TODO: Okay I think I get it now. This should really be "avoidEventHandler".
      // Per https://react.dev/learn/separating-events-from-effects
      // Maybe with that in mind, I can check some other code to better validate it?
      // Like find the set state call that corresponds to the state in the deps.
      // Maybe this whole rule is a combination of "what is the effect doing" and "in response to what"?
      avoidDelayedSideEffect:
        "Avoid using useEffect to react to state changes. When possible, use direct callbacks (like `onCompleted`) instead. If no callback exists, reacting to state may be necessary.",
    },
  },
  create: (context) => {
    let useStates; // Map of setter name -> { stateName, node }
    let propsNames; // Set of prop names

    // TODO: Could use scope to make this more apparent?
    // Not sure it'd have a functional difference though.
    const setupComponentScope = (param) => {
      useStates = new Map();
      propsNames = new Set();

      if (!param) return;
      getPropsNames(param).forEach((name) => {
        propsNames.add(name);
      });
    };

    const isStateSetterCall = (callExpr) =>
      callExpr.callee.type === "Identifier" &&
      useStates.has(callExpr.callee.name);
    const isPropCallback = (callExpr) =>
      propsNames.has(getBaseName(callExpr.callee));

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
        const deps = getUseEffectDeps(node);
        if (!effectFn || !deps) return;

        const callExprs = getCallExpressions(
          context,
          context.sourceCode.getScope(effectFn.body),
        );

        // TODO: Should also check that either deps is empty, or all useState/props?
        // Otherwise we could get false positive when the dep is state from e.g. a library,
        // because we might not have a callback to use instead (whereas with useState we always do).
        const isInternalEffect = callExprs.every(
          (callExpr) => isStateSetterCall(callExpr) || isPropCallback(callExpr),
        );

        if (isInternalEffect) {
          // Warn about the entire effect
          context.report({
            node,
            messageId: "avoidInternalEffect",
          });

          // Give more specific feedback
          callExprs
            .filter((callExpr) => isStateSetterCall(callExpr))
            .forEach((callExpr) => {
              const stateName = useStates.get(callExpr.callee.name).stateName;
              if (findReference(context, callExpr.arguments, deps)) {
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidDerivedState",
                  data: { state: stateName },
                });
              } else if (deps.length === 0) {
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidInitializingState",
                });
              } else {
                // TODO: Is this always the final case?
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidChainingState",
                });
              }
            });

          callExprs
            .filter((callExpr) => isPropCallback(callExpr))
            .forEach((callExpr) => {
              if (findReference(context, callExpr.arguments, deps)) {
                // The rule is only meant to prevent passing *intermediate* state.
                // Passing *final* state, like when the user completes a form, is a valid use case.
                // So we check the callback name as a heuristic.
                // TODO: Is there ever a valid use case for passing final state via an effect though?
                // Surely that could fall under chaining state?
                // TODO: Should this trigger without depinArgs too? Technically that could result in parent state changes. But maybe it's more valid.
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidPassingIntermediateDataToParent",
                });
              }
            });
        } else {
          // Do nothing. Too hard to accurately assess the side effect's validity.
          // May be some cases we can sus out...
          // At best I think we can warn against using state as a signal to trigger the action
          // rather than calling it directly in response to the event.
          // i.e. avoid state as event handler.
          // But I thinkkk that's frequently valid.
          // Maybe we can make some guesses based on the external function names?
          // If we do anything here, it should be configurable due to possible false positives.
        }
      },
    };
  },
};

const allowedPropsCallbacks = ["onSave", "onSubmit"];
