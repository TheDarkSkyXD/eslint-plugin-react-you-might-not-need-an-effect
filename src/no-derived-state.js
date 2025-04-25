export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow setting derived state from props or other state in a useEffect.",
    },
    messages: {
      avoidDerivedState:
        'Avoid storing derived state. Compute "{{state}}" directly from other props or state during render.',
    },
  },
  create: (context) => {
    let stateSetters = new Map(); // state variable -> setter name

    return {
      // Collect `useState`s
      VariableDeclarator(node) {
        // Match: const [foo, setFoo] = useState(...)
        if (
          node.init &&
          node.init.type === "CallExpression" &&
          node.init.callee.name === "useState" &&
          node.id.type === "ArrayPattern" &&
          node.id.elements.length === 2
        ) {
          const stateVar = node.id.elements[0].name;
          const setter = node.id.elements[1].name;
          stateSetters.set(setter, stateVar);
        }
      },

      // Check `useEffect` for uses of `useState` setters
      CallExpression(node) {
        // Match useEffect(...)
        if (node.callee.name !== "useEffect" || node.arguments.length < 1)
          return;

        const effectFn = node.arguments[0];
        if (
          !effectFn ||
          (effectFn.type !== "ArrowFunctionExpression" &&
            effectFn.type !== "FunctionExpression")
        )
          return;

        // Traverse the useEffect body to find calls to setters
        if (effectFn.body.type === "BlockStatement") {
          for (const stmt of effectFn.body.body) {
            if (
              stmt.type === "ExpressionStatement" &&
              stmt.expression.type === "CallExpression"
            ) {
              const callee = stmt.expression.callee;
              if (
                callee.type === "Identifier" &&
                stateSetters.has(callee.name)
              ) {
                context.report({
                  node: callee,
                  messageId: "avoidDerivedState",
                  data: { state: stateSetters.get(callee.name) },
                });
              }
            }
          }
        } else if (effectFn.body.type === "CallExpression") {
          // TODO: effectFn.body is a CallExpression when it has no braces; not a BlockStatement
        }
      },
    };
  },
};
