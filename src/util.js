import { findVariable } from "eslint-utils";

// Lightweight AST traversal
const traverse = (context, node, visit, visited = new Set()) => {
  if (visited.has(node)) {
    return;
  }

  visited.add(node);
  visit(node);

  (context.sourceCode.visitorKeys[node.type] || [])
    .map((key) => node[key])
    // Some `visitorKeys` are optional, e.g. `IfStatement.alternate`.
    .filter((child) => child)
    // `child` can be an array, like `CallExpression.arguments`
    .flatMap((child) => (Array.isArray(child) ? child : [child]))
    // Confirm it's a valid AST node (not sure why it wouldn't be?)
    .filter((child) => typeof child.type === "string")
    .forEach((child) => traverse(context, child, visit, visited));
};

const collectIdentifiers = (context, rootNode) => {
  const identifiers = [];
  traverse(context, rootNode, (node) => {
    if (node.type === "Identifier") {
      identifiers.push(node);
    }
  });
  return identifiers;
};

export const isReactFunctionalComponent = (node) => {
  const isFunctionComponent = node.type === "FunctionDeclaration";
  const isArrowFunctionComponent =
    node.type === "VariableDeclarator" &&
    node.init.type === "ArrowFunctionExpression";
  return (
    (isFunctionComponent || isArrowFunctionComponent) &&
    node.id.type === "Identifier" &&
    node.id.name[0].toUpperCase() === node.id.name[0]
  );
};

export const isUseState = (node) => {
  return (
    node.init &&
    node.init.type === "CallExpression" &&
    node.init.callee.name === "useState" &&
    node.id.type === "ArrayPattern" &&
    node.id.elements.length === 2 &&
    node.id.elements.every((el) => el.type === "Identifier")
  );
};

export const isUseEffect = (node) => {
  return (
    (node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "useEffect") ||
    (node.callee.type === "MemberExpression" &&
      node.callee.object.name === "React" &&
      node.callee.property.name === "useEffect")
  );
};

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

  const identifiers = collectIdentifiers(context, depsArr);

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

// When would defs.length be > 0...? Shadowed variables?
export const isStateRef = (ref) =>
  ref.resolved?.defs.some(
    (def) => def.type === "Variable" && isUseState(def.node),
  );

export const isPropsRef = (ref) =>
  ref.resolved?.defs.some(
    (def) =>
      def.type === "Parameter" &&
      isReactFunctionalComponent(
        def.node.type === "ArrowFunctionExpression"
          ? def.node.parent
          : def.node,
      ),
  );

export const isLocalRef = (ref, effectFnScope) => {
  return effectFnScope.variables.some(
    (variable) => variable.defs === ref.resolved?.defs,
  );
};

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

export const isPathBetween = (
  src,
  dest,
  context,
  scope,
  visited = new Set(),
) => {
  if (!dest || typeof dest !== "object" || visited.has(dest)) {
    return false;
  }

  visited.add(dest);

  const identifiers = collectIdentifiers(context, dest);
  if (identifiers.some((identifier) => identifier.name === src.name)) {
    return true;
  }

  return identifiers
    .map((identifier) => findVariable(scope, identifier))
    .filter((variable) => variable)
    .some((variable) =>
      variable.defs
        .filter((def) => def.type === "Variable") // Could be e.g. `Parameter` if it's a function parameter in a Promise chain
        .some((def) =>
          isPathBetween(src, def.node.init, context, scope, visited),
        ),
    );
};
