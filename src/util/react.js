import { findVariable } from "eslint-utils";
import {
  traverse,
  getDownstreamIdentifiers,
  getUpstreamVariables,
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
  node.id.elements.length === 2 &&
  node.id.elements.every((el) => {
    // Apparently skipping the state element is a valid use.
    // I suppose technically the state can still be read via setter callback.
    return !el || el.type === "Identifier";
  });

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

// NOTE: When `MemberExpression` (even nested ones), a `Reference` is only the root object, not the function.
export const getEffectBodyRefs = (context, node) => {
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
// NOTE: Despite different implementation from `getEffectBodyRefs`,
// I believe it behaves the same due to filtering by `findVariable`.
// TODO: Share implementation though?
// Basically use this impl for both, instead of scope.references for other?
// Hmm maybe not; not traversing CallExpr.arguments could be a problem for that use.
// e.g. when a prop is passed to a state setter.
// Or maybe that's fine? We'll still analyze the state setter, where we then explicitly check its arguments.
export function getDependencyRefs(context, node) {
  if (!isUseEffect(node) || node.arguments.length < 2) {
    return null;
  }

  const depsArr = node.arguments[1];
  if (depsArr.type !== "ArrayExpression") {
    return null;
  }

  return getDownstreamIdentifiers(context, depsArr)
    .map((node) => [
      node,
      findVariable(context.sourceCode.getScope(node), node),
    ])
    .filter(([_node, variable]) => variable)
    .flatMap(([node, variable]) =>
      // TODO: Is the filter necessary?
      variable.references.filter((ref) => ref.identifier === node),
    );
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

export const isPropsUsedToResetAllState = (
  context,
  effectFnRefs,
  depsRefs,
  useEffectNode,
) => {
  const stateSetterRefs = effectFnRefs
    .filter((ref) => isFnRef(ref))
    .filter((ref) => isStateRef(context, ref));

  return (
    depsRefs.some((ref) => isPropRef(context, ref)) &&
    stateSetterRefs.length > 0 &&
    stateSetterRefs.every((ref) => isSetStateToInitialValue(context, ref)) &&
    stateSetterRefs.length ===
      countUseStates(context, findContainingComponentNode(useEffectNode))
  );
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
