import {
  getEffectFnCallExpressions,
  getUseEffectFn,
  isReactComponent,
  isUseEffect,
  isEqualFields,
  getBaseName,
} from "./util.js";

// NOTE: Only supports functional components
export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow setting parent state from the child",
      url: "https://react.dev/learn/you-might-not-need-an-effect#passing-data-to-the-parent",
    },
    messages: {
      avoidPassingDataToParent:
        'React state should not flow from from children to parents. Consider lifting "{{data}}" into the parent.',
    },
  },
  create: (context) => {
    let propsNames;

    function getPropsNames(fnParam) {
      if (fnParam.type === "ObjectPattern") {
        return fnParam.properties.map(
          // Important to use `value`, not `name`, in case it was renamed in the destructuring
          (property) => property.value.name,
        );
      } else if (fnParam.type === "Identifier") {
        return [fnParam.name];
      }
    }

    return {
      FunctionDeclaration(node) {
        if (!isReactComponent(node)) return;
        propsNames = new Set();

        const fnParamNode = node.params[0];
        if (!fnParamNode) return;

        getPropsNames(fnParamNode).forEach((name) => {
          propsNames.add(name);
        });
      },

      VariableDeclarator(node) {
        if (!isReactComponent(node)) return;
        propsNames = new Set();

        const fnParamNode = node.init.params[0];
        if (!fnParamNode) return;

        getPropsNames(fnParamNode).forEach((name) => {
          propsNames.add(name);
        });
      },

      // Look for `useEffect`s that call props with arguments from their dependencies (the latter implying it's data and not a normal callback)
      CallExpression(node) {
        if (!isUseEffect(node) || node.arguments.length < 1) return;

        const depsNodes = node.arguments[1]?.elements;
        if (!depsNodes) return;

        const effectFn = getUseEffectFn(node);
        if (!effectFn) return;

        // Traverse the `useEffect` body to find calls to props
        getEffectFnCallExpressions(effectFn)?.forEach((callExpression) => {
          const callee = callExpression.callee;
          const isPropCallback =
            // Destructured prop
            (callee.type === "Identifier" && propsNames.has(callee.name)) ||
            // Field access on non-destructured prop
            (callee.type === "MemberExpression" &&
              callee.object.type === "Identifier" &&
              propsNames.has(callee.object.name));

          if (!isPropCallback) return;

          const propCallbackArgs = callExpression.arguments;
          const propCallbackArgFromDeps = propCallbackArgs.find((arg) =>
            depsNodes.find((dep) => isEqualFields(arg, dep)),
          );

          if (propCallbackArgFromDeps) {
            context.report({
              node: callee,
              messageId: "avoidPassingDataToParent",
              data: {
                data: getBaseName(propCallbackArgFromDeps),
              },
            });
          }
        });
      },
    };
  },
};
