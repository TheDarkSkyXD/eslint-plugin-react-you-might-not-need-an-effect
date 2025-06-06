import { messageIds, messages } from "./messages.js";
import { getCallExpr, getDownstreamRefs } from "./util/ast.js";
import {
  isFnRef,
  findPropUsedToResetAllState,
  isUseEffect,
  getUseStateNode,
  getEffectFnRefs,
  getDependenciesRefs,
  isStateSetter,
  isPropCallback,
  getEffectFn,
  isDirectCall,
  getUpstreamReactVariables,
  isState,
  isProp,
  isHOCProp,
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

      const effectFnRefs = getEffectFnRefs(context, node);
      const depsRefs = getDependenciesRefs(context, node);

      if (!effectFnRefs || !depsRefs) {
        return;
      } else if (effectFnRefs.length === 0) {
        // Hopefully it's obvious the effect can be removed.
        // More a follow-up for once they fix/remove other issues.
        context.report({
          node,
          messageId: messageIds.avoidEmptyEffect,
        });
        return;
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
        // Don't flag anything else -- confusing, and this should be fixed first.
        return;
      }

      effectFnRefs
        .filter(
          (ref) =>
            isStateSetter(context, ref) ||
            (isPropCallback(context, ref) &&
              // Don't analyze HOC prop callbacks -- we don't have control over them to lift state or logic
              !isHOCProp(ref.resolved)),
        )
        .filter((ref) => isDirectCall(ref.identifier))
        .forEach((ref) => {
          const callExpr = getCallExpr(ref);

          if (isStateSetter(context, ref)) {
            const useStateNode = getUseStateNode(context, ref);
            const stateName = (
              useStateNode.id.elements[0] ?? useStateNode.id.elements[1]
            )?.name;

            if (depsRefs.length === 0) {
              context.report({
                node: callExpr,
                messageId: messageIds.avoidInitializingState,
                data: { state: stateName },
              });
            }

            // TODO: Make more readable
            const isArgsInternal = callExpr.arguments
              .flatMap((arg) => getDownstreamRefs(context, arg))
              .flatMap((ref) =>
                getUpstreamReactVariables(context, ref.identifier),
              )
              .notEmptyEvery(
                (variable) =>
                  isState(variable) ||
                  (isProp(variable) && !isHOCProp(variable)),
              );
            const isArgsExternal = callExpr.arguments
              .flatMap((arg) => getDownstreamRefs(context, arg))
              .flatMap((ref) =>
                getUpstreamReactVariables(context, ref.identifier),
              )
              .some(
                (variable) =>
                  (!isState(variable) && !isProp(variable)) ||
                  isHOCProp(variable),
              );
            const isDepsInternal = depsRefs
              .flatMap((ref) =>
                getUpstreamReactVariables(context, ref.identifier),
              )
              .notEmptyEvery(
                (variable) =>
                  isState(variable) ||
                  (isProp(variable) && !isHOCProp(variable)),
              );

            if (isArgsInternal) {
              // TODO: Can also warn if this is the only call to the setter,
              // even if the arg is external (and not retrieved in the effect)...
              // Does it matter whether the args are in the deps array?
              // I guess so, to differentiate between derived and chain state updates?
              // What about internal vs in deps? Changes behavior, but meaningfully?
              context.report({
                node: callExpr,
                messageId: messageIds.avoidDerivedState,
                data: { state: stateName },
              });
            }

            if (!isArgsInternal && !isArgsExternal && isDepsInternal) {
              context.report({
                node: callExpr,
                messageId: messageIds.avoidChainingState,
              });
            }
          } else if (isPropCallback(context, ref)) {
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
            context.report({
              node: callExpr,
              messageId: messageIds.avoidParentChildCoupling,
            });
          }
        });
    },
  }),
};
