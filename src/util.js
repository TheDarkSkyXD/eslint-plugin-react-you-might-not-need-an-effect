import { findVariable } from "eslint-utils";

// Lightweight AST traversal
const traverse = (context, node, visit) => {
  visit(node);

  const visitorKeys = context.sourceCode.visitorKeys;

  const keys = visitorKeys[node.type];
  keys.forEach((key) => {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((childNode) => {
        traverse(context, childNode, visit);
      });
    } else {
      traverse(context, child, visit);
    }
  });
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

export const getEffectFnRefs = (context, node) => {
  if (!isUseEffect(node) || node.arguments.length < 1) return null;

  const effectFn = node.arguments[0];

  const getRefs = (scope) =>
    scope.references.concat(
      scope.childScopes.flatMap((childScope) => getRefs(childScope)),
    );

  return getRefs(context.sourceCode.getScope(effectFn));
};

// Dependency array doesn't have its own scope, so collecting refs is trickier
export function getDepArrRefs(context, node) {
  if (!isUseEffect(node) || node.arguments.length < 2) return null;

  const depsArr = node.arguments[1];
  if (depsArr.type !== "ArrayExpression") return null;

  const identifiers = [];
  traverse(context, depsArr, (node) => {
    if (node.type === "Identifier") {
      identifiers.push(node);
    }
  });

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
export const isDerivedRef = (ref, effectFnScope) => {
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

// TODO: Returns true for e.g. ref name is `foo` and arg is `foobar`
export const isRefUsedInArgs = (ref, args, context) =>
  args.some((arg) =>
    context.sourceCode.getText(arg).includes(ref.identifier.name),
  );
