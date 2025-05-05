import {
  isUseEffect,
  getEffectFnRefs,
  getDepArrRefs,
  isStateSetterCalledWithDefaultValue,
  isPropsRef,
  isStateRef,
  isFnRef,
  getUseStateNode,
  isPathBetween,
  isDerivedRef,
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

      // Props warnings
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
      if (!isUseEffect(node)) return;

      const effectFnRefs = getEffectFnRefs(context, node);
      const depsRefs = getDepArrRefs(context, node);
      const effectFn = node.arguments[0];

      if (!effectFnRefs || !depsRefs || !effectFn) return;

      const isInternalEffect = effectFnRefs
        .concat(depsRefs)
        .every(
          (ref) =>
            isStateRef(ref) ||
            isPropsRef(ref) ||
            isDerivedRef(ref, context.sourceCode.getScope(effectFn)),
        );

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
