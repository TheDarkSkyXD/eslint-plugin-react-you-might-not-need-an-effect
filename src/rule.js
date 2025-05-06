import {
  isUseEffect,
  getEffectFnRefs,
  getDepArrRefs,
  isStateSetterCalledWithDefaultValue,
  isPropRef,
  isStateRef,
  isFnRef,
  getUseStateNode,
  isPathBetween,
  isLocalRef,
  getEffectFn,
} from "./util.js";

export const name = "you-might-not-need-an-effect";

export const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn against unnecessary React useEffect hooks.",
      url: "https://react.dev/learn/you-might-not-need-an-effect",
    },
    schema: [],
    // TODO: Could include more info in messages, like the relevant node
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

      // Prop warnings
      avoidManagingParentBehavior:
        "Avoid managing parent behavior. Instead, lift this logic up to the parent component.",
      avoidPassingStateToParent:
        "Avoid making parent components depend on a child's intermediate state. If the parent needs live updates, consider lifting state up.",
      avoidResettingStateFromProps:
        "Avoid resetting state from props. If the prop is a key, pass it as `key` instead so React will reset the component.",

      // TODO: This would be nice, but I'm not sure it can be done accurately
      // Maybe we can accurately warn about this when the state being reacted to is one of our own `useState`s?
      // Because if we have a setter then we have a callback.
      // But, I think that would also warn about valid uses that synchronize internal state to external state.
      // avoidEventHandler:
      //   "Avoid using state as an event handler. Instead, call the event handler directly.",
    },
  },
  create: (context) => ({
    CallExpression: (node) => {
      if (!isUseEffect(node)) {
        return;
      }

      const effectFn = getEffectFn(node);
      const effectFnRefs = getEffectFnRefs(context, node);
      const depsRefs = getDepArrRefs(context, node);

      if (!effectFn || !effectFnRefs || !depsRefs) {
        return;
      }

      // TODO: Could include when we reference our own local functions that are themselves pure/internal.
      const isInternalEffect = effectFnRefs
        .concat(depsRefs)
        .every(
          (ref) =>
            isStateRef(ref) ||
            isPropRef(ref) ||
            isLocalRef(ref, context.sourceCode.getScope(effectFn)),
        );

      if (isInternalEffect) {
        context.report({
          node,
          messageId: "avoidInternalEffect",
        });
      }

      const stateSetterRefs = effectFnRefs
        .filter((ref) => isFnRef(ref))
        .filter((ref) => isStateRef(ref));
      const isPropUsedInDeps = depsRefs.some((ref) => isPropRef(ref));
      const isEveryStateSetterCalledWithDefaultValue =
        stateSetterRefs.length > 0 &&
        stateSetterRefs.every((ref) =>
          isStateSetterCalledWithDefaultValue(ref, context),
        );
      if (isPropUsedInDeps && isEveryStateSetterCalledWithDefaultValue) {
        context.report({
          node: node,
          messageId: "avoidResettingStateFromProps",
        });
      }

      if (
        effectFnRefs.every((ref) => isPropRef(ref)) &&
        depsRefs.every((ref) => isPropRef(ref))
      ) {
        context.report({
          node: node,
          messageId: "avoidManagingParentBehavior",
        });
      }

      effectFnRefs
        .filter((ref) => isFnRef(ref))
        .forEach((ref) => {
          const callExpr = ref.identifier.parent;
          const isDepUsedInArgs = callExpr.arguments.some((arg) =>
            depsRefs.some((depRef) =>
              isPathBetween(
                depRef.identifier,
                arg,
                context,
                context.sourceCode.getScope(effectFn),
              ),
            ),
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
              } else if (depsRefs.length > 0) {
                // TODO: Is this a correct assumption by now?
                // Should I flag this whenever the call expr argument is *only* the state?
                // Like this seems more appropriate than "derived" state.
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidChainingState",
                });
              } else {
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidInitializingState",
                });
              }
            }
          }

          // I think this is the only !isInternalEffect case we can reasonably warn about
          if (isPropRef(ref) && isDepUsedInArgs) {
            context.report({
              node: callExpr.callee,
              messageId: "avoidPassingStateToParent",
            });
          }
        });
    },
  }),
};
