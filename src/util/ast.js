import { findVariable } from "eslint-utils";

export const traverse = (context, node, visit, visited = new Set()) => {
  if (visited.has(node)) {
    return;
  }

  visited.add(node);
  visit(node);

  (context.sourceCode.visitorKeys[node.type] || [])
    // Don't traverse CallExpression arguments - the function may be unpure, thus its arguments are irrelevant.
    // Ideally we'd move it out of this general-purpose function, but alternative checks haven't been successful.
    .filter((key) => !(node.type === "CallExpression" && key === "arguments"))
    .map((key) => node[key])
    // Some `visitorKeys` are optional, e.g. `IfStatement.alternate`.
    .filter(Boolean)
    // Can be an array, like `CallExpression.arguments`
    .flatMap((child) => (Array.isArray(child) ? child : [child]))
    // Can rarely be `null`, e.g. `ArrayPattern.elements[1]` when an element is skipped - `const [a, , b] = arr`
    .filter(Boolean)
    // Check it's a valid AST node
    .filter((child) => typeof child.type === "string")
    .forEach((child) => traverse(context, child, visit, visited));
};

export const getDownstreamIdentifiers = (context, rootNode) => {
  const identifiers = [];
  traverse(context, rootNode, (node) => {
    if (node.type === "Identifier") {
      identifiers.push(node);
    }
  });
  return identifiers;
};

export const getUpstreamVariables = (context, node, visited = new Set()) => {
  if (!node || typeof node !== "object" || visited.has(node)) {
    return [];
  }

  visited.add(node);

  return getDownstreamIdentifiers(context, node)
    .map((identifier) =>
      findVariable(context.sourceCode.getScope(node), identifier),
    )
    .filter(Boolean) // Implicit base case: Uses variable(s) declared outside this scope TODO: Does that affect tests that use undefined functions?
    .flatMap((variable) =>
      variable.defs
        .filter((def) => def.type === "Variable") // Could be e.g. `Parameter` if it's a function parameter in a Promise chain
        .flatMap((def) => getUpstreamVariables(context, def.node.init, visited))
        .concat(variable),
    );
};

export const isFnRef = (ref) =>
  ref.identifier.parent.type === "CallExpression" &&
  // ref.identifier.parent will also be CallExpression when the ref is a direct argument, which we don't want
  ref.identifier.parent.callee === ref.identifier;

// `every` returning `true` for an empty array is often not what we want.
// False positives if we're not careful.
// We could use `!some`, but meh readability.
Object.defineProperty(Array.prototype, "notEmptyEvery", {
  value: function (predicate) {
    return this.length > 0 && this.every(predicate);
  },
});
