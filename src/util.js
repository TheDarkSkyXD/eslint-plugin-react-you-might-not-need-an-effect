export const isUseState = (node) => {
  return (
    node.init &&
    node.init.type === "CallExpression" &&
    node.init.callee.name === "useState" &&
    node.id.type === "ArrayPattern" &&
    node.id.elements.length === 2
  );
};

export const isUseEffect = (node) => {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "useEffect"
  );
};

export const getUseEffectFn = (node) => {
  if (!isUseEffect(node) || node.arguments.length < 1) return null;

  const effectFn = node.arguments[0];
  if (
    !effectFn ||
    (effectFn.type !== "ArrowFunctionExpression" &&
      effectFn.type !== "FunctionExpression")
  )
    return null;

  return effectFn;
};

export const isReactComponent = (node) => {
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

export const getEffectFnCallExpressions = (effectFn) => {
  if (effectFn.body.type === "BlockStatement") {
    // This is the case for `useEffect(() => { setState(...); })`
    return effectFn.body.body
      .filter(
        (stmt) =>
          stmt.type === "ExpressionStatement" &&
          stmt.expression.type === "CallExpression",
      )
      .map((stmt) => stmt.expression);
  } else if (effectFn.body.type === "CallExpression") {
    // This is the case for `useEffect(() => setState(...))`
    return [effectFn.body];
  } else {
    return null;
  }
};

export const isEqualFields = (node1, node2) => {
  // Base case
  if (node1.type === "Identifier" && node2.type === "Identifier") {
    return node1.name === node2.name;
  }

  // Recursively check nested members
  if (node1.type === "MemberExpression" && node2.type === "MemberExpression") {
    return (
      node1.property.name === node2.property.name &&
      isEqualFields(node1.object, node2.object)
    );
  }

  // We've recursed far enough and one node is shallower than the other (i.e. different types)
  return false;
};

export const getBaseName = (node) => {
  if (node.type === "MemberExpression") {
    return getBaseName(node.object);
  } else if (node.type === "Identifier") {
    return node.name;
  }
  return null;
};
