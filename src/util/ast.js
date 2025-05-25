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
  if (visited.has(node)) {
    return [];
  }

  visited.add(node);

  return (
    getDownstreamIdentifiers(context, node)
      .map((identifier) =>
        findVariable(context.sourceCode.getScope(node), identifier),
      )
      // Implicit base case: Uses variable(s) declared outside this scope
      // TODO: I think that affects tests with technically undefined functions...
      // Even some global functions return `undefined`, like `fetch`
      .filter(Boolean)
      .flatMap((variable) =>
        variable.defs
          .filter((def) => !!def.node.init) // Happens when the variable is declared without an initializer, e.g. `let foo;`
          .flatMap((def) =>
            getUpstreamVariables(context, def.node.init, visited),
          )
          .concat(variable),
      )
  );
};

export const getDownstreamRefs = (context, node) =>
  getDownstreamIdentifiers(context, node)
    .map((identifier) => getRef(context, identifier))
    .filter(Boolean);

export const getRef = (context, identifier) =>
  findVariable(
    context.sourceCode.getScope(identifier),
    identifier,
  )?.references.find((ref) => ref.identifier === identifier);

export const getCallExpr = (ref, current = ref.identifier.parent) => {
  if (current.type === "CallExpression") {
    // We've reached the top - confirm that the ref is the (eventual) callee, as opposed to an argument.
    let node = ref.identifier;
    while (node.parent.type === "MemberExpression") {
      node = node.parent;
    }

    if (current.callee === node) {
      return current;
    }
  }

  if (current.type === "MemberExpression") {
    return getCallExpr(ref, current.parent);
  }

  return undefined;
};
