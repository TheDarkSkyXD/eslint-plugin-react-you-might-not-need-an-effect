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

export const getCallExpressions = (context, scope) => {
  return (
    scope.references
      .map((ref) => {
        let node = ref.identifier.parent;
        while (node.type === "MemberExpression") {
          // Walk up to the CallExpression
          node = node.parent;
        }
        return node;
      })
      // Sometimes it walks all the way to the top of the tree...
      .filter((node) => node?.type === "CallExpression")
      // Remove duplicates - `scope.references` includes both the callee (i.e. function) and
      // any of its arguments that reference variables - their parent is the same CallExpression.
      .filter(
        (node1, i, self) =>
          i === self.findIndex((node2) => node2.range === node1.range),
      )
      .concat(
        scope.childScopes.flatMap((childScope) =>
          getCallExpressions(context, childScope),
        ),
      )
  );
};

// NOTE: Comparing source text is the easiest way to handle various structures
// (Identifier vs MemberExpression, complex nested expressions, etc.),
// but it probably can't handle edge cases like derived variables.
// e.g. Confirmed that it misses variables destructured from the dependency.
export const findReference = (context, haystack, needles) => {
  return haystack.find((hay) =>
    needles.find((needle) =>
      context.sourceCode
        .getText(hay)
        .startsWith(context.sourceCode.getText(needle)),
    ),
  );
};
