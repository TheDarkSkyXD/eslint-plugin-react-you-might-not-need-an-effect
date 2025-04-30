import {
  isUseState,
  isUseEffect,
  getCallExpressions,
  isReactFunctionalComponent,
  getUseEffectFnAndDeps,
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
    let useStates;
    let props;

    // TODO: Could use scope to make this more apparent?
    // Not sure it'd have a functional difference though.
    const setupComponentScope = (param) => {
      useStates = [];
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
      useStates.some(
        (useState) => useState.id.elements[1].name === callExpr.callee.name,
      );
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
          useStates.push(node);
        }
      },

      CallExpression: (node) => {
        if (!isUseEffect(node)) return;
        const [effectFn, deps] = getUseEffectFnAndDeps(node);
        if (!effectFn || !deps) return;

        const callExprs = getCallExpressions(
          context,
          context.sourceCode.getScope(effectFn.body),
        );

        // TODO: callExprs includes e.g. `todos.concat()`, which is pure but not a state setter...
        // Is it possible to tell if it's pure? At worst we can check a long list of them? Lol.
        const isInternalEffect =
          callExprs.every(
            (callExpr) =>
              isStateSetterCall(callExpr) || isPropCallback(callExpr),
          ) &&
          deps.every((dep) => {
            const depName = context.sourceCode.getText(dep);
            return (
              useStates.some((useState) =>
                depName.startsWith(useState.id.elements[0].name),
              ) ||
              props.some((prop) =>
                depName.startsWith(context.sourceCode.getText(prop)),
              )
            );
          });

        if (isInternalEffect) {
          // Warn about the entire effect
          context.report({
            node,
            messageId: "avoidInternalEffect",
          });

          if (
            findReference(context, deps, props) &&
            callExprs.every((callExpr) => {
              if (!isStateSetterCall(callExpr)) return false;

              const useStateNode = useStates.find(
                (useState) =>
                  useState.id.elements[1].name === callExpr.callee.name,
              );
              const useStateDefaultValue = useStateNode.init.arguments?.[0];
              return (
                context.sourceCode.getText(callExpr.arguments[0]) ===
                context.sourceCode.getText(useStateDefaultValue)
              );
            })
          ) {
            context.report({
              node: node,
              messageId: "avoidResettingStateFromProps",
            });
            return;
          }

          // Give more specific feedback
          callExprs
            .filter((callExpr) => isStateSetterCall(callExpr))
            .forEach((callExpr) => {
              const useStateNode = useStates.find(
                (useState) =>
                  useState.id.elements[1].name === callExpr.callee.name,
              );
              if (findReference(context, callExpr.arguments, deps)) {
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidDerivedState",
                  data: { state: useStateNode.id.elements[0].name },
                });
              } else if (deps.length === 0) {
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidInitializingState",
                });
              } else {
                // TODO: Is this a correct assumption by now?
                context.report({
                  node: callExpr.callee,
                  messageId: "avoidChainingState",
                });
              }
            });

          callExprs
            .filter((callExpr) => isPropCallback(callExpr))
            .forEach((callExpr) => {
              if (findReference(context, callExpr.arguments, deps)) {
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

const allowedPropsCallbacks = ["onSave", "onSubmit"];
