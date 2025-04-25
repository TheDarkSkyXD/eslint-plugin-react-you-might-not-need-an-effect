import { getUseEffectFn, isReactComponent, isUseEffect } from "./util.js";

// NOTE: Only supports:
// - Functional components
// - Block bodies in `useEffect`
// - Destructured props
export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow setting parent state from the child",
      url: "https://react.dev/learn/you-might-not-need-an-effect#passing-data-to-the-parent",
    },
    messages: {
      avoidPassingDataToParent:
        'React state should flow from parents to their children; never from children to parents. Consider lifting "{{data}}" into the parent.',
    },
  },
  create: (context) => {
    // TODO: I think this would overlap on multiple components in one file?
    const propsNames = new Set();

    function collectPropsNames(fnParam) {
      if (fnParam.type === "ObjectPattern") {
        fnParam.properties
          .map(
            // Important to use `value`, not `name`, in case it was renamed in the destructuring
            (property) => property.value.name,
          )
          .forEach((destructuredName) => propsNames.add(destructuredName));
      } else if (fnParam.type === "Identifier") {
        propsNames.add(fnParam.name);
      }
    }

    return {
      FunctionDeclaration(node) {
        if (!isReactComponent(node)) return;

        const fnParamNode = node.params[0];
        if (!fnParamNode) return;

        collectPropsNames(fnParamNode);
      },

      VariableDeclarator(node) {
        if (!isReactComponent(node)) return;

        const fnParamNode = node.init.params[0];
        if (!fnParamNode) return;

        collectPropsNames(fnParamNode);
      },

      // Look for `useEffect`s that call props with arguments from their dependencies (the latter implying it's data and not a normal callback)
      CallExpression(node) {
        if (!isUseEffect(node) || node.arguments.length < 1) return;

        const depsNodes = node.arguments[1]?.elements;
        if (!depsNodes) return;

        const effectFn = getUseEffectFn(node);
        if (!effectFn) return;

        // Traverse the `useEffect` body to find calls to props
        if (effectFn.body.type === "BlockStatement") {
          for (const stmt of effectFn.body.body) {
            if (
              stmt.type === "ExpressionStatement" &&
              stmt.expression.type === "CallExpression"
            ) {
              const callee = stmt.expression.callee;
              const isPropCallback =
                // Destructured prop
                (callee.type === "Identifier" && propsNames.has(callee.name)) ||
                // Field access on non-destructured prop
                (callee.type === "MemberExpression" &&
                  callee.object.type === "Identifier" &&
                  propsNames.has(callee.object.name));
              if (!isPropCallback) continue;

              const propCallbackArgs = stmt.expression.arguments;
              // TODO: support object property access
              const propCallbackArgFromDeps = propCallbackArgs.find((arg) => {
                if (arg.type === "Identifier") {
                  return depsNodes.find((dep) => dep.name === arg.name);
                }
                // if (arg.type === "MemberExpression") {
                //   return depsNodes.find(
                //     (dep) =>
                //       dep.type === "Identifier" && dep.name === arg.object.name,
                //   );
                // }
              });

              if (propCallbackArgFromDeps) {
                context.report({
                  node: callee,
                  messageId: "avoidPassingDataToParent",
                  data: {
                    data: propCallbackArgFromDeps.name,
                  },
                });
              }
            }
          }
        }
      },
    };
  },
};
