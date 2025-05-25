import {
  traverse,
  getUpstreamVariables,
  getDownstreamRefs,
  getCallExpr,
} from "./ast.js";

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
  // Not sure its usecase, but may just have the setter
  (node.id.elements.length === 1 || node.id.elements.length === 2) &&
  node.id.elements.every((el) => {
    // Apparently skipping the state element is a valid use.
    // I suppose technically the state can still be read via setter callback.
    return !el || el.type === "Identifier";
  });

export const isUseEffect = (node) =>
  (node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    (node.callee.name === "useEffect" ||
      node.callee.name === "useLayoutEffect")) ||
  (node.callee.type === "MemberExpression" &&
    node.callee.object.name === "React" &&
    (node.callee.property.name === "useEffect" ||
      node.callee.property.name === "useLayoutEffect"));

export const getEffectFn = (node) => {
  if (!isUseEffect(node) || node.arguments.length < 1) {
    return undefined;
  }

  const effectFn = node.arguments[0];
  if (
    effectFn.type !== "ArrowFunctionExpression" &&
    effectFn.type !== "FunctionExpression"
  ) {
    return undefined;
  }

  return effectFn;
};

// I tried to mimick the implementation for deps, but it seems to
// not return things with no local variable... like my tests that use
// undefined functions lol, or even `fetch`... But it finds `JSON`?
// `traverse` avoiding CallExpression arguments also affects using it here.
// NOTE: When `MemberExpression` (even nested ones), a `Reference` is only the root object, not the function.
export const getEffectFnRefs = (context, node) => {
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

export function getDependenciesRefs(context, node) {
  if (!isUseEffect(node) || node.arguments.length < 2) {
    return undefined;
  }

  const depsArr = node.arguments[1];
  if (depsArr.type !== "ArrayExpression") {
    return undefined;
  }

  return getDownstreamRefs(context, depsArr);
}

export const isFnRef = (ref) => getCallExpr(ref) !== undefined;

// FIX: Returns true for functions defined outside the effect that set state but also call external functions.
// I think that's fine, because it does reference state eventually.
// But separately we need to check whether a reference chain is pure.
// Normally I think `isInternalEffect` protects against this, but it misses
// when the effect references a function of the aforementioned nature.
export const isStateRef = (context, ref) =>
  getUseStateNode(context, ref) !== undefined;

export const isPropRef = (context, ref) =>
  getUpstreamVariables(context, ref.identifier).some((variable) =>
    variable.defs.some(
      (def) =>
        def.type === "Parameter" &&
        isReactFunctionalComponent(
          def.node.type === "ArrowFunctionExpression"
            ? def.node.parent
            : def.node,
        ),
    ),
  );

export const getUseStateNode = (context, ref) => {
  return getUpstreamVariables(context, ref.identifier)
    .find((variable) =>
      // NOTE: Global variables (like `JSON` in `JSON.stringify()`) have an empty `defs`; fortunately `[].some() === false`.
      // Also, I'm not sure so far when `defs.length > 1`... haven't seen it with shadowed variables or even redeclared variables with `var`.
      variable.defs.some(
        (def) => def.type === "Variable" && isUseState(def.node),
      ),
    )
    ?.defs.find((def) => def.type === "Variable" && isUseState(def.node))?.node;
};

export const findPropUsedToResetAllState = (
  context,
  effectFnRefs,
  depsRefs,
  useEffectNode,
) => {
  // TODO: Technically this includes state with call expressions, like countryCode.toUpperCase().
  // A true `isStateSetter` would check that the identifier name matches the useState's second element.
  const stateSetterRefs = effectFnRefs
    .filter((ref) => isFnRef(ref))
    .filter((ref) => isStateRef(context, ref));

  const isAllStateReset =
    stateSetterRefs.length > 0 &&
    stateSetterRefs.every((ref) => isSetStateToInitialValue(context, ref)) &&
    stateSetterRefs.length ===
      countUseStates(context, findContainingComponentNode(useEffectNode));

  return isAllStateReset
    ? depsRefs.find((ref) => isPropRef(context, ref))
    : undefined;
};

const isSetStateToInitialValue = (context, setterRef) => {
  const setStateToValue = getCallExpr(setterRef).arguments[0];
  const stateInitialValue = getUseStateNode(context, setterRef).init
    .arguments[0];

  // `useState()` (with no args) defaults to `undefined`,
  // so ommitting the arg is equivalent to passing `undefined`.
  // Technically this would false positive if they shadowed
  // `undefined` in only one of the scopes (only possible via `var`),
  // but I hope no one would do that.
  const isUndefined = (node) => node === undefined || node.name === "undefined";
  if (isUndefined(setStateToValue) && isUndefined(stateInitialValue)) {
    return true;
  }

  // `sourceCode.getText()` returns the entire file when passed null/undefined - let's short circuit that
  if (setStateToValue === null && stateInitialValue === null) {
    return true;
  } else if (
    (setStateToValue && !stateInitialValue) ||
    (!setStateToValue && stateInitialValue)
  ) {
    return false;
  }

  return (
    context.sourceCode.getText(setStateToValue) ===
    context.sourceCode.getText(stateInitialValue)
  );
};

const countUseStates = (context, componentNode) => {
  let count = 0;

  traverse(context, componentNode, (node) => {
    if (isUseState(node)) {
      count++;
    }
  });

  return count;
};

const findContainingComponentNode = (node) => {
  if (!node) {
    return undefined;
  } else if (isReactFunctionalComponent(node)) {
    return node;
  }

  return findContainingComponentNode(node.parent);
};
