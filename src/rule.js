import {
  isUseEffect,
  getEffectFnRefs,
  getDepArrRefs,
  isStateSetterCalledWithDefaultValue,
  isPropRef,
  isStateRef,
  isFnRef,
  getUseStateNode,
  getUpstreamVariables,
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
    // TODO: Possible to detect and warn when `useSyncExternalStore` should be preferred?
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

      if (
        !effectFn ||
        !effectFnRefs ||
        !depsRefs ||
        effectFnRefs.length === 0
      ) {
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
        // TODO: Needs to check for useStates that aren't referenced in the effect
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
        // TODO: Eagerly filter out everything but state and prop refs.
        // No point in analyzing their args (?).
        .forEach((ref) => {
          const callExpr = ref.identifier.parent;
          // TODO: Seems these should be `every`, not `some`?
          // But then we need to skip intermediate variables
          // and only consider terminal/leaf ones.
          // (Beware of [].every() === true)
          // For now this shortcoming is protected by the isInternalEffect check though.
          const isDepInArgs = callExpr.arguments.some((arg) =>
            getUpstreamVariables(context, arg).some((variable) =>
              // TODO: I think we should check that the variable is state or props?
              // Currently this will be true even if the state is derived from external state, which can be valid.
              // But it's protected by the isInternalEffect check.
              // Does it matter whether it's in the deps array?
              // I guess for the "passing data to parent" case, we can warn even when state is external, so this is correct.
              depsRefs.some(
                (depRef) => depRef.identifier.name === variable.name,
              ),
            ),
          );

          if (isInternalEffect) {
            if (isStateRef(ref)) {
              const useStateNode = getUseStateNode(ref);
              // TODO: We may be able to reliably detect this even when the effect isn't entirely internal?
              // All that matters is the path to the setter's args is internal.
              // Consider large effects that may combine technically separate effects.
              // However I think it's still legit if it's derived from external state,
              // and the setter is called more than just in this effect.
              if (isDepInArgs) {
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidDerivedState",
                  data: { state: useStateNode.id.elements[0].name },
                });
              } else if (
                depsRefs.length > 0 &&
                depsRefs.every((ref) => isStateRef(ref) || isPropRef(ref))
              ) {
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
          if (isPropRef(ref) && isDepInArgs) {
            context.report({
              node: callExpr.callee,
              messageId: "avoidPassingStateToParent",
            });
          }
        });
    },
  }),
};
