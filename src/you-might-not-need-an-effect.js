import {
  isUseEffect,
  getEffectFnRefs,
  getDepArrRefs,
  isStateSetterCalledWithDefaultValue,
  isPropsRef,
  isStateRef,
  isFnRef,
  getUseStateNode,
  isRefUsedInArgs,
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
  create: (context) => ({
    CallExpression: (node) => {
      if (!isUseEffect(node)) return;

      const effectFnRefs = getEffectFnRefs(context, node);
      const depsRefs = getDepArrRefs(context, node);

      if (!effectFnRefs || !depsRefs) return;

      const isInternalEffect = effectFnRefs
        .concat(depsRefs)
        .every((ref) => isStateRef(ref) || isPropsRef(ref));

      if (isInternalEffect) {
        context.report({
          node,
          messageId: "avoidInternalEffect",
        });
      }

      const fnRefs = effectFnRefs.filter((ref) => isFnRef(ref));

      const isPropUsedInDeps = depsRefs.some((ref) => isPropsRef(ref));
      const isEveryStateSetterCalledWithDefaultValue =
        fnRefs.filter((ref) => isStateRef(ref)).length > 0 &&
        fnRefs
          .filter((ref) => isStateRef(ref))
          .every((ref) => isStateSetterCalledWithDefaultValue(ref, context));
      if (isPropUsedInDeps && isEveryStateSetterCalledWithDefaultValue) {
        context.report({
          node: node,
          messageId: "avoidResettingStateFromProps",
        });
      }

      fnRefs.forEach((ref) => {
        const callExpr = ref.identifier.parent;
        const isDepUsedInArgs = depsRefs.some((depRef) =>
          isRefUsedInArgs(depRef, callExpr.arguments, context),
        );

        if (isInternalEffect) {
          if (isStateRef(ref)) {
            const useStateNode = getUseStateNode(ref);
            if (isDepUsedInArgs) {
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
          }
        }

        // I think this is the only !isInternalEffect case we can reasonably warn about
        if (isPropsRef(ref) && isDepUsedInArgs) {
          context.report({
            node: callExpr.callee,
            messageId: "avoidPassingStateToParent",
          });
        }
      });
    },
  }),
};
