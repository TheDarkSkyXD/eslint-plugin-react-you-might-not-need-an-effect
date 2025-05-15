import { findVariable } from "eslint-utils";

// Lightweight AST traversal
const traverse = (context, node, visit, visited = new Set()) => {
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

const getDownstreamIdentifiers = (context, rootNode) => {
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
    .filter(Boolean) // Implicit base case: Uses variable(s) declared outside this scope
    .flatMap((variable) =>
      variable.defs
        .filter((def) => def.type === "Variable") // Could be e.g. `Parameter` if it's a function parameter in a Promise chain
        .flatMap((def) => getUpstreamVariables(context, def.node.init, visited))
        .concat(variable),
    );
};

export const isReactFunctionalComponent = (node) =>
  (node.type === "FunctionDeclaration" ||
    (node.type === "VariableDeclarator" &&
      node.init.type === "ArrowFunctionExpression")) &&
  node.id.type === "Identifier" &&
  node.id.name[0].toUpperCase() === node.id.name[0];

export const isUseState = (node) =>
  node.init &&
  node.init.type === "CallExpression" &&
  node.init.callee.name === "useState" &&
  node.id.type === "ArrayPattern" &&
  node.id.elements.length === 2 &&
  node.id.elements.every((el) => el.type === "Identifier");

export const isUseEffect = (node) =>
  (node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "useEffect") ||
  (node.callee.type === "MemberExpression" &&
    node.callee.object.name === "React" &&
    node.callee.property.name === "useEffect");

export const getEffectFn = (node) => {
  if (!isUseEffect(node) || node.arguments.length < 1) {
    return null;
  }

  const effectFn = node.arguments[0];
  if (
    effectFn.type !== "ArrowFunctionExpression" &&
    effectFn.type !== "FunctionExpression"
  ) {
    return null;
  }

  return effectFn;
};

export const getEffectFnRefs = (context, node) => {
  if (!isUseEffect(node) || node.arguments.length < 1) {
    return null;
  }

  const effectFn = getEffectFn(node);
  if (!effectFn) {
    return null;
  }

  const getRefs = (scope) =>
    scope.references.concat(
      scope.childScopes.flatMap((childScope) => getRefs(childScope)),
    );

  return getRefs(context.sourceCode.getScope(effectFn));
};

// Dependency array doesn't have its own scope, so collecting refs is trickier
export function getDepArrRefs(context, node) {
  if (!isUseEffect(node) || node.arguments.length < 2) {
    return null;
  }

  const depsArr = node.arguments[1];
  if (depsArr.type !== "ArrayExpression") {
    return null;
  }

  const identifiers = getDownstreamIdentifiers(context, depsArr);

  const scope = context.sourceCode.getScope(node);
  return identifiers
    .map((node) => [node, findVariable(scope, node)])
    .filter(([_node, variable]) => variable)
    .flatMap(([node, variable]) =>
      variable.references.filter((ref) => ref.identifier === node),
    );
}

export const isFnRef = (ref) =>
  ref.identifier.parent.type === "CallExpression" &&
  // ref.identifier.parent will also be CallExpression when the ref is an argument, which we don't want
  ref.identifier.parent.callee === ref.identifier;

export const isStateRef = (context, ref) =>
  getUpstreamVariables(context, ref.identifier).some((variable) =>
    // TODO: Should be just the latest definition? Is that how that works?
    // WARNING: Global variables (like `JSON`) have an empty `defs`. Thus important to use `notEmptyEvery`.
    variable.defs.notEmptyEvery(
      (def) => def.type === "Variable" && isUseState(def.node),
    ),
  );

export const isPropRef = (context, ref) =>
  getUpstreamVariables(context, ref.identifier).some((variable) =>
    variable.defs.notEmptyEvery(
      (def) =>
        def.type === "Parameter" &&
        isReactFunctionalComponent(
          def.node.type === "ArrowFunctionExpression"
            ? def.node.parent
            : def.node,
        ),
    ),
  );

export const getUseStateNode = (stateRef) =>
  stateRef.resolved.defs.find(
    (def) => def.type === "Variable" && isUseState(def.node),
  )?.node;

export const isStateSetterCalledWithDefaultValue = (setterRef, context) => {
  const callExpr = setterRef.identifier.parent;
  const useStateDefaultValue = getUseStateNode(setterRef).init.arguments?.[0];
  return (
    context.sourceCode.getText(callExpr.arguments[0]) ===
    context.sourceCode.getText(useStateDefaultValue)
  );
};

Object.defineProperty(Array.prototype, "notEmptyEvery", {
  value: function (predicate) {
    return this.length > 0 && this.every(predicate);
  },
});
