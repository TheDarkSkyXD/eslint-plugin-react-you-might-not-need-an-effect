import {
  isUseState,
  isUseEffect,
  getUseEffectFn,
  getCallExpressions,
  isReactFunctionalComponent,
  getUseEffectDeps,
  findReference,
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
      // Props warnings
      avoidPassingIntermediateDataToParent:
        "Avoid making parent components depend on a child's intermediate state. If the parent needs live updates, consider lifting state up.",
      avoidResettingStateFromProps:
        "Avoid resetting state from props. If the prop is a key, pass it as `key` instead so React will reset the component.",

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
    let props; // Set of prop names

    // TODO: Could use scope to make this more apparent?
    // Not sure it'd have a functional difference though.
    const setupComponentScope = (param) => {
      useStates = new Map();
      props = [];

      if (!param) return;

      if (param.type === "ObjectPattern") {
        props = param.properties.map(
          // Important to use `value`, not `name`, in case it was renamed in the destructuring
          (property) => property.value,
        );
      } else if (param.type === "Identifier") {
        props = [param];
      }
    };

    const isStateSetterCall = (callExpr) =>
      callExpr.callee.type === "Identifier" &&
      useStates.has(callExpr.callee.name);
    const isPropCallback = (callExpr) =>
      findReference(context, [callExpr.callee], props) !== undefined;

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
        // TODO: callExprs includes e.g. `todos.concat()`, which is pure but not a state setter...
        // Is it possible to tell if it's pure? At worst we can check a long list of them? Lol.
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
              const { stateName, node: useStateNode } = useStates.get(
                callExpr.callee.name,
              );
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
              } else if (
                // The state setter is called with the default value
                context.sourceCode.getText(callExpr.arguments[0]) ===
                  context.sourceCode.getText(
                    useStateNode.init.arguments?.[0],
                  ) &&
                // Props trigger the effect
                findReference(context, deps, props)
              ) {
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidResettingStateFromProps",
                });
              } else {
                // TODO: Is this a correct assumption by now?
                // TODO: Can get false positive if reacting to state change from library that doesn't offer callback
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidChainingState",
                });
              }
              // TODO: When in response to a props change, and the state setter is called with
              // seState's default, it should warn to use `key` instead
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
