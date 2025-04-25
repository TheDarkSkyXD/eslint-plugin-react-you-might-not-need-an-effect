import { isUseState, isUseEffect } from "./util.js";

// NOTE: Only supports `useEffect`s with block bodies
export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow setting derived state from props or other state in a useEffect.",
      url: "https://react.dev/learn/you-might-not-need-an-effect",
    },
    fixable: "code",
    messages: {
      avoidDerivedState:
        'Avoid storing derived state. Compute "{{state}}" directly from other props or state during render.',
    },
  },
  create: (context) => {
    const stateSetters = new Map(); // state variable -> setter name
    const stateNodes = new Map(); // state name -> node of the useState variable declarator

    return {
      // Collect `useState`s
      VariableDeclarator(node) {
        // Match: `const [foo, setFoo] = useState(...)`
        if (!isUseState(node)) return;

        const [state, setter] = node.id.elements;
        if (state?.type === "Identifier" && setter?.type === "Identifier") {
          stateSetters.set(setter.name, state.name);
          stateNodes.set(state.name, node);
        }
      },

      // Check `useEffect` for uses of `useState` setters
      CallExpression(node) {
        // Match `useEffect(...)`
        if (!isUseEffect(node) || node.arguments.length < 1) return;

        const effectFn = node.arguments[0];
        // Will these ever not be the case? What else could be passed?
        // I guess a reference to a function?
        if (
          !effectFn ||
          (effectFn.type !== "ArrowFunctionExpression" &&
            effectFn.type !== "FunctionExpression")
        )
          return;

        // Traverse the `useEffect` body to find calls to setters
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
                const stateVar = stateSetters.get(callee.name);
                const stateDeclNode = stateNodes.get(stateVar);

                context.report({
                  node: callee,
                  messageId: "avoidDerivedState",
                  data: { state: stateSetters.get(callee.name) },
                  fix: (fixer) => {
                    const setStateArgs = stmt.expression.arguments;
                    const argSource = context
                      .getSourceCode()
                      .getText(setStateArgs[0]);

                    return [
                      // Compute state during render,
                      // replacing `const [foo, setFoo] = useState(...)`
                      // TODO: presumably breaks when `setStateArgs` is a function
                      fixer.replaceText(
                        stateDeclNode.parent,
                        `const ${stateVar} = ${argSource};`,
                      ),
                      // Remove the setState call in `useEffect`
                      fixer.remove(stmt),
                    ];
                  },
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
