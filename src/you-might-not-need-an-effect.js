import {
  isUseState,
  isUseEffect,
  getUseEffectFn,
  getCallExpressions,
  isReactFunctionalComponent,
  getUseEffectDeps,
  findDepInArgs,
  getPropsNames,
  getBaseName,
  isSingleStatementFn,
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
      // TODO: One of these needs to suggest that state be updated in a callback, rather than a useEffect that monitors state.
      // e.g. using Apollo's `onCompleted` instead of a `useEffect` that reacts to the query result.
      // Maybe in avoidDerivedState? Because it would flag that currently.
      // However it kinda fits avoidDelayedSideEffect too, because the intermediate state (the query result) is used to trigger the event handler (setting other state),
      // when the event handler should be handled directly (in `onCompleted`). Not entirely sure this can be understood in all cases.
      // And some libraries don't offer callbacks, only values, in which case you *have* to react to changes with a useEffect.
      // But generally I think it should be in your control, and you can ignore it when not.
      // I think...?
      // Anyway, how can I tell those apart to give the right suggestion?
      // Maybe check if the callback is a state setter vs anything else?
      // Pretty good chance I need to remove the fixes too. Seems complex to handle correctly, if possible at all.
      avoidDerivedState:
        'Avoid storing derived state. Compute "{{state}}" directly during render, optionally with `useMemo` if it\'s expensive.',
      // TODO: I think this gives false positives sometimes. Like if the child exposes some form UI and
      // then notifies the parent with the results upon completion. Which I think is a valid use case?
      avoidPassingIntermediateDataToParent:
        "Avoid making parent components depend on a child component's intermediate state. Consider lifting state if needed.",
      avoidDelayedSideEffect:
        "Avoid waiting for state changes to trigger side effects in useEffect. When possible, handle the action directly.",
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

        getCallExpressions(
          context,
          context.sourceCode.getScope(effectFn.body),
        ).forEach((callExpr) => {
          const callee = callExpr.callee;
          const depInArgs = findDepInArgs(
            context,
            depsNodes,
            callExpr.arguments,
          );
          const isStateSetterCall =
            callee.type === "Identifier" && useStates.has(callee.name);
          const isPropCallback = propsNames.has(getBaseName(callee));

          if (depInArgs && isStateSetterCall) {
            const { stateName } = useStates.get(callExpr.callee.name);
            context.report({
              node: callExpr.callee,
              messageId: "avoidDerivedState",
              data: { state: stateName },
            });
          } else if (
            isPropCallback &&
            depInArgs &&
            // The rule is only meant to prevent passing *intermediate* state.
            // Passing *final* state, like when the user completes a form, is a valid use case.
            // So we check the callback name as a heuristic.
            // It's also intentional that we then proceed to the check for delayed side effects;
            // in the form example, that's the correct warning to give.
            !allowedPropsCallbacks.includes(getBaseName(callee))
          ) {
            context.report({
              node: callExpr.callee,
              messageId: "avoidPassingIntermediateDataToParent",
            });
          } else if (depsNodes.length > 0) {
            // We're calling a side effect in response to a state change.
            // WARNING: This case can't always be fixed.
            // It requires that the state we're reacting to has an equivalent callback.
            // e.g. `onCompleted` instead of reacting to `data` changing.
            // But some libraries only expose state, without callbacks.
            context.report({
              node: callExpr.callee,
              messageId: "avoidDelayedSideEffect",
            });
          }
        });
      },
    };
  },
};

const allowedPropsCallbacks = ["onSave", "onSubmit"];
