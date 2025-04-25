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
  return (
    node.type === "FunctionDeclaration" &&
    node.id.type === "Identifier" &&
    node.id.name[0].toUpperCase() === node.id.name[0]
  );
};
