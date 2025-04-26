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

export const getUseEffectDeps = (node) => {
  if (!isUseEffect(node) || node.arguments.length < 2) return null;

  const deps = node.arguments[1];
  if (deps.type !== "ArrayExpression") return null;

  return deps.elements;
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

export const isSingleStatementEffectFn = (effectFn) =>
  effectFn.body.type === "CallExpression" ||
  (effectFn.body.type === "BlockStatement" && effectFn.body.body.length === 1);

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

  // They're not the same type
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

// NOTE: Comparing source text is the easiest way to handle various structures
// (Identifier vs MemberExpression, complex nested expressions, etc.),
// but it probably can't handle edge cases like shadowed variables
export const findDepUsedInArgs = (context, deps, args) => {
  return args.find((arg) =>
    deps.find((dep) =>
      context
        .getSourceCode()
        .getText(arg)
        .includes(context.getSourceCode().getText(dep)),
    ),
  );
};

export const getPropsNames = (fnParam) => {
  if (fnParam.type === "ObjectPattern") {
    return fnParam.properties.map(
      // Important to use `value`, not `name`, in case it was renamed in the destructuring
      (property) => property.value.name,
    );
  } else if (fnParam.type === "Identifier") {
    return [fnParam.name];
  }
};
