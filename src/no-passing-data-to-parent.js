import { isReactComponent, isUseEffect } from "./util.js";

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
  // NOTE: Only supports:
  // - Functional components
  // - Block bodies in `useEffect`
  // - Destructured props
  create: (context) => {
    // TODO: I think this would overlap on multiple components in one file?
    const propsNames = new Set();

    return {
      // Collect props names
      FunctionDeclaration(node) {
        if (!isReactComponent(node)) return;

        node.params.forEach((fnParam) => {
          if (fnParam.type === "ObjectPattern") {
            const destructuredNames = fnParam.properties.map(
              (prop) => prop.key.name,
            );
            propsNames.add(...destructuredNames);
          } else if (fnParam.type === "Identifier") {
            const paramNames = fnParam.map((param) => param.name);
            propsNames.add(...paramNames);
          }
        });
      },

      // Look for `useEffect`s that call props with arguments from their dependencies (the latter implying it's data and not a normal callback)
      CallExpression(node) {
        if (!isUseEffect(node) || node.arguments.length < 1) return;

        const depsNodes = node.arguments[1]?.elements;
        if (!depsNodes) return;

        const effectFn = node.arguments[0];
        if (
          !effectFn ||
          (effectFn.type !== "ArrowFunctionExpression" &&
            effectFn.type !== "FunctionExpression")
        )
          return;

        // Traverse the `useEffect` body to find calls to props
        if (effectFn.body.type === "BlockStatement") {
          for (const stmt of effectFn.body.body) {
            if (
              stmt.type === "ExpressionStatement" &&
              stmt.expression.type === "CallExpression"
            ) {
              const callee = stmt.expression.callee;
              const isPropCallback = propsNames.has(callee.name);
              if (callee.type !== "Identifier" || !isPropCallback) continue;

              const propCallbackArgs = stmt.expression.arguments;
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
