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
      avoidDerivedState:
        'Avoid storing derived state. Compute "{{state}}" directly during render, optionally with `useMemo` if it\'s expensive.',
      avoidChainingState:
        "Avoid chaining state changes. When possible, update all relevant state simultaneously.",
      avoidPassingIntermediateDataToParent:
        "Avoid making parent components depend on a child's intermediate state. If the parent needs live updates, consider lifting state up.",
      avoidDelayedSideEffect:
        "Avoid using useEffect to react to state changes. When possible, use direct callbacks (like `onCompleted`) instead. If no callback exists, reacting to state may be necessary.",
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

        // Usually these are valid.
        // Unless we care to check for something really jank, like setting state on mount.
        if (depsNodes.length === 0) return;

        getCallExpressions(
          context,
          context.sourceCode.getScope(effectFn.body),
        ).forEach((callExpr) => {
          const callee = callExpr.callee;
          const depInArgs = findReference(
            context,
            callExpr.arguments,
            depsNodes,
          );
          const isStateSetterCall =
            callee.type === "Identifier" && useStates.has(callee.name);
          const isPropCallback = propsNames.has(getBaseName(callee));
          // TODO: Is this always the case? Could it be anything else?
          const isSideEffect = !isStateSetterCall && !isPropCallback;

          if (isStateSetterCall && depInArgs) {
            const { stateName } = useStates.get(callExpr.callee.name);
            if (depInArgs) {
              context.report({
                node: callExpr.callee,
                messageId: "avoidDerivedState",
                data: { state: stateName },
              });
            } else {
              // TODO: Check that the triggering dep is also a useState?
              // There are some valid reasons to call a setter inside an effect. Like storing a fetch result.
              context.report({
                node: callExpr.callee,
                messageId: "avoidChainingState",
              });
            }
          } else if (
            isPropCallback &&
            depInArgs && // TODO: Should this trigger without depinArgs too? Technically that could result in parent state changes. But maybe it's more valid.
            // The rule is only meant to prevent passing *intermediate* state.
            // Passing *final* state, like when the user completes a form, is a valid use case.
            // So we check the callback name as a heuristic.
            // It's also intentional that we then proceed to the check for delayed side effects;
            // in the form example, that's the correct warning to give.
            // I don't think there's a valid use case for passing final state via a useEffect?
            // TODO: or maybe we should give both warnings?
            !allowedPropsCallbacks.includes(getBaseName(callee))
          ) {
            context.report({
              node: callExpr.callee,
              messageId: "avoidPassingIntermediateDataToParent",
            });
          } else if (depsNodes.length > 0) {
            // We're reacting to a state change.
            // WARNING: Sometimes this case can't be avoided or is preferrable.
            // It requires that the state we're reacting to has an equivalent callback,
            // e.g. `onCompleted` instead of reacting to `data` changing.
            // Additionally, it is often more readable to use an effect to synchronize React state with external state.
            // TODO: Flags https://react.dev/learn/you-might-not-need-an-effect#fetching-data
            // which apparently is valid. Possible to detect?
            // Maybe just mention in the message that it's also okay if there are multiple reasons to trigger the effect?
            // TODO: As the most unreliable check, it should have an option to disable it.
            //
            // Maybe the key here is "side effect"?
            // We could flag it only if the effect is not truly a side effect.
            // i.e. it exists within React and thus doesn't need an escape hatch - setting state, calling a prop, etc.
            // That is more reliable. And a frequent misuse.
            // "avoidUnnecessaryEscapeHatch"?
            // Do the prior two rules already cover that?
            // I don't think so? Or at least, not as specifically?
            // They both check that a dep is used in the arg - that's not always the case, but can still be inadvisable.
            //
            // Separately we can still flag true side effects that react to state,
            // that could possibly be avoided via callbacks. But that is less reliable.
            context.report({
              node: callExpr.callee,
              messageId: "avoidDelayedSideEffect",
            });
          }
          // NOTE: We don't examine effects with no dependencies. Too hard to accurately assess their validity.
        });
      },
    };
  },
};

const allowedPropsCallbacks = ["onSave", "onSubmit"];
