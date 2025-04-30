import {
  isUseState,
  isUseEffect,
  isReactFunctionalComponent,
  getUseEffectFnAndDeps,
  findReference,
  getRefCallExpr,
  getEffectFnRefs,
  getDepArrRefs,
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
      avoidPassingStateToParent:
        "Avoid making parent components depend on a child's intermediate state. If the parent needs live updates, consider lifting state up.",
      avoidResettingStateFromProps:
        "Avoid resetting state from props. If the prop is a key, pass it as `key` instead so React will reset the component.",

      // TODO: Okay I think I get it now. This should really be "avoidEventHandler".
      // Per https://react.dev/learn/separating-events-from-effects
      // Maybe with that in mind, I can check some other code to better validate it?
      // Like find the set state call that corresponds to the state in the deps.
      // Maybe this whole rule is a combination of "what is the effect doing" and "in response to what"?
      avoidEventHandler:
        "Avoid using state as an event handler. Instead, call the event handler directly.",
    },
  },
  create: (context) => {
    // When would defs.length be > 0...? Shadowed variables?
    const isStateRef = (ref) =>
      ref.resolved?.defs.some(
        (def) => def.type === "Variable" && isUseState(def.node),
      );
    const isPropsRef = (ref) =>
      ref.resolved?.defs.some(
        (def) =>
          def.type === "Parameter" && isReactFunctionalComponent(def.node),
      );

    return {
      CallExpression: (node) => {
        if (!isUseEffect(node)) return;

        const effectFnRefs = getEffectFnRefs(context, effectFn);
        const depsRefs = getDepArrRefs(context, node);

        if (!effectFnRefs || !depsRefs) return;

        const isInternalEffect =
          effectFnRefs.every((ref) => isStateRef(ref) || isPropsRef(ref)) &&
          depsRefs.every((ref) => isStateRef(ref) || isPropsRef(ref));

        if (isInternalEffect) {
          // Warn about the entire effect
          context.report({
            node,
            messageId: "avoidInternalEffect",
          });

          // if (
          //   findReference(context, deps, props) &&
          //   callExprs.every((callExpr) => {
          //     if (!isStateRef(callExpr)) return false;
          //
          //     const useStateNode = useStates.find(
          //       (useState) =>
          //         useState.id.elements[1].name === callExpr.callee.name,
          //     );
          //     const useStateDefaultValue = useStateNode.init.arguments?.[0];
          //     return (
          //       context.sourceCode.getText(callExpr.arguments[0]) ===
          //       context.sourceCode.getText(useStateDefaultValue)
          //     );
          //   })
          // ) {
          //   context.report({
          //     node: node,
          //     messageId: "avoidResettingStateFromProps",
          //   });
          //   return;
          // }

          effectFnRefs
            .filter((ref) => isStateRef(ref))
            .map((ref) => getRefCallExpr(ref))
            .filter((callExpr) => callExpr) // Only state setters, not the state itself
            .filter(
              (node1, i, self) =>
                i === self.findIndex((node2) => node2.range === node1.range),
            )
            .forEach((callExpr) => {
              const useStateNode = useStates.find(
                (useState) =>
                  useState.id.elements[1].name === callExpr.callee.name,
              );
              if (findReference(context, callExpr.arguments, depsArr)) {
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidDerivedState",
                  data: { state: useStateNode.id.elements[0].name },
                });
              } else if (depsRefs.length === 0) {
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidInitializingState",
                });
              } else {
                // TODO: Is this a correct assumption by now?
                // Should I flag this whenever the call expr argument is *only* the state?
                // Like this seems more appropriate than "derived" state.
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidChainingState",
                });
              }
            });

          effectFnRefs
            .filter((ref) => isPropsRef(ref))
            .map((ref) => getRefCallExpr(ref))
            .filter((callExpr) => callExpr) // Only state setters, not the state itself
            .forEach((callExpr) => {
              // FIX: Wrongly flags functions called on stateful props, like `props.list.concat()`
              if (findReference(context, callExpr.arguments, depsArr)) {
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidPassingStateToParent",
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
          // TODO: I think we can still warn about passing state to parent, and suggest lifting it?
        }
      },
    };
  },
};
