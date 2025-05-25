import { messageIds, messages } from "./messages.js";
import { getUpstreamVariables } from "./util/ast.js";
import {
  isFnRef,
  isPropRef,
  findPropUsedToResetAllState,
  isStateRef,
  isUseEffect,
  getEffectFn,
  getDependenciesArr,
  getUseStateNode,
  getCallExpr,
  getDownstreamRefs,
  getEffectFnRefs,
} from "./util/react.js";

export const name = "you-might-not-need-an-effect";

export const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Catch unnecessary React useEffect hooks.",
      url: "https://react.dev/learn/you-might-not-need-an-effect",
    },
    schema: [],
    messages: messages,
  },
  create: (context) => ({
    CallExpression: (node) => {
      if (!isUseEffect(node)) {
        return;
      }

      const depsArr = getDependenciesArr(node);
      if (!depsArr) {
        return;
      }

      const effectFnRefs = getEffectFnRefs(context, node);
      const depsRefs = getDownstreamRefs(context, depsArr);
      console.log("effectFnRefs", effectFnRefs);

      if (!effectFnRefs || effectFnRefs.length === 0 || !depsRefs) {
        return;
      }

      // FIX: Needs to confirm *every* variable on a ref chain is internal, not just *some* of them.
      // TODO: Or just remove? It's never reported in isolation afaik.
      // And presumably once the user fixes the more specific issue, they'll see the effect is empty and delete it.
      const isInternalEffect = effectFnRefs
        // Only functions because they actually have effects.
        // Notably this also filters out refs that are local parameters, like `items` in `list.filter((item) => ...)`.
        .filter((ref) => isFnRef(ref))
        .concat(depsRefs)
        .every((ref) => isStateRef(context, ref) || isPropRef(context, ref));

      if (isInternalEffect) {
        context.report({
          node,
          messageId: messageIds.avoidInternalEffect,
        });
      }

      const propUsedToResetAllState = findPropUsedToResetAllState(
        context,
        effectFnRefs,
        depsRefs,
        node,
      );
      if (propUsedToResetAllState) {
        const propName = propUsedToResetAllState.identifier.name;
        context.report({
          node: node,
          messageId: messageIds.avoidResettingStateFromProps,
          data: { prop: propName },
        });

        // Don't flag anything else (particularly avoidChainingState will trigger).
        // Just confusing, and this should be fixed first.
        return;
      }

      effectFnRefs
        // Analyze only state setters and prop callbacks
        .filter(
          (ref) =>
            isFnRef(ref) &&
            (isStateRef(context, ref) || isPropRef(context, ref)),
        )
        .forEach((ref) => {
          const callExpr = getCallExpr(ref);
          const isDepInArgs = callExpr.arguments.some((arg) =>
            getUpstreamVariables(context, arg).some((variable) =>
              depsRefs.some(
                (depRef) => depRef.identifier.name === variable.name,
              ),
            ),
          );

          // TODO: Instead of the entire effect, we can check that just the state setter's args are not external.
          if (isInternalEffect) {
            if (isStateRef(context, ref)) {
              const useStateNode = getUseStateNode(context, ref);
              const stateName = useStateNode.id.elements[0]?.name; // TODO: Fallback to setter name? For value-less useState.
              // TODO: Can also warn if this is the only call to the setter...
              // Does it matter whether the args are in the deps array?
              // I guess so, to differentiate between derived and chain state updates?
              if (isDepInArgs) {
                context.report({
                  node: callExpr,
                  messageId: messageIds.avoidDerivedState,
                  data: { state: stateName },
                });
              } else if (
                depsRefs.some(
                  (ref) => isStateRef(context, ref) || isPropRef(context, ref),
                )
              ) {
                context.report({
                  node: callExpr,
                  messageId: messageIds.avoidChainingState,
                });
              } else if (depsRefs.length === 0) {
                context.report({
                  node: callExpr,
                  messageId: messageIds.avoidInitializingState,
                  data: { state: stateName },
                });
              }
            }
          }

          // I'm pretty sure we can flag this regardless of the arguments, including none...
          //
          // Because we are either:
          // 1. Passing live state updates to the parent
          // 2. Using state as an event handler to pass final state to the parent
          //
          // Both are bad. However I'm not yet sure how we could differentiate #2 to give a better warning.
          //
          // TODO: Can we thus safely assume that state is used as an event handler when the ref is a prop?
          // Normally we can't warn about that because we don't know what the event handler does externally.
          // But when it's a prop, it's internal.
          // I guess it could still be valid when the dep is external state? Or in that case,
          // the issue is the state should be lifted to the parent?
          if (isPropRef(context, ref)) {
            context.report({
              node: callExpr,
              messageId: messageIds.avoidParentChildCoupling,
            });
          }
        });
    },
  }),
};
