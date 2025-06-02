import {
  traverse,
  getUpstreamVariables,
  getDownstreamRefs,
  getCallExpr,
} from "./ast.js";

// NOTE: Returns false for HOC'd components aside from `memo`.
// Which is good? Because the developer may not have control over that to e.g. lift state.
// So we should treat it as external state.
// TODO: Will not detect when they define the component normally and then export it wrapped in the HOC.
export const isReactFunctionalComponent = (node) =>
  (node.type === "FunctionDeclaration" ||
    (node.type === "VariableDeclarator" &&
      (node.init.type === "ArrowFunctionExpression" ||
        (node.init.type === "CallExpression" &&
          node.init.callee.type === "Identifier" &&
          node.init.callee.name === "memo")))) &&
  node.id.type === "Identifier" &&
  node.id.name[0].toUpperCase() === node.id.name[0];

export const isUseState = (node) =>
  node.type === "VariableDeclarator" &&
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

// NOTE: When `MemberExpression` (even nested ones), a `Reference` is only the root object, not the function.
export const getEffectFnRefs = (context, node) => {
  const effectFn = getEffectFn(node);
  if (!effectFn) {
    return null;
  }

  return getDownstreamRefs(context, effectFn);
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
// TODO: Technically this includes state with call expressions, like countryCode.toUpperCase().
// A true `isStateSetter` would check that the identifier name matches the useState's second element.
// Maybe we sometimes prefer this behavior though, like when state is mutated (even though that is not recommended).
export const isStateSetter = (context, ref) =>
  isFnRef(ref) &&
  getUpstreamReactVariables(context, ref.identifier).notEmptyEvery((variable) =>
    isState(variable),
  );
export const isPropCallback = (context, ref) =>
  isFnRef(ref) &&
  getUpstreamReactVariables(context, ref.identifier).notEmptyEvery((variable) =>
    isProp(variable),
  );

// NOTE: Literals are discarded (because they have no variable) and thus do not count against this.
export const isInternal = (context, ref) =>
  getUpstreamReactVariables(context, ref.identifier).every(
    (variable) => isState(variable) || isProp(variable),
  );

export const isArgsInternal = (context, args) =>
  args.notEmptyEvery((arg) =>
    getDownstreamRefs(context, arg).notEmptyEvery((ref) =>
      isInternal(context, ref),
    ),
  );

// NOTE: Global variables (like `JSON` in `JSON.stringify()`) have an empty `defs`; fortunately `[].some() === false`.
// Also, I'm not sure so far when `defs.length > 1`... haven't seen it with shadowed variables or even redeclared variables with `var`.
const isState = (variable) => variable.defs.some((def) => isUseState(def.node));
const isProp = (variable) =>
  variable.defs.some(
    (def) =>
      def.type === "Parameter" &&
      isReactFunctionalComponent(
        // TODO: Simplify this
        def.node.type === "ArrowFunctionExpression"
          ? def.node.parent.type === "CallExpression"
            ? def.node.parent.parent
            : def.node.parent
          : def.node,
      ),
  );

export const getUseStateNode = (context, ref) => {
  return getUpstreamReactVariables(context, ref.identifier)
    .find((variable) => isState(variable))
    ?.defs.find((def) => isUseState(def.node))?.node;
};

export const findPropUsedToResetAllState = (
  context,
  effectFnRefs,
  depsRefs,
  useEffectNode,
) => {
  const stateSetterRefs = effectFnRefs.filter((ref) =>
    isStateSetter(context, ref),
  );

  const isAllStateReset =
    stateSetterRefs.length > 0 &&
    stateSetterRefs.every((ref) => isSetStateToInitialValue(context, ref)) &&
    stateSetterRefs.length ===
      countUseStates(context, findContainingNode(useEffectNode));

  return isAllStateReset
    ? depsRefs.find((ref) => isProp(ref.resolved))
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

// Returns the component or custom hook that contains the `useEffect` node.
// It assumes the useEffect is a direct child, which it always should be in valid React.
// TODO: But I think this will crash if e.g. the useEffect is called conditionally.
const findContainingNode = (useEffectNode) => {
  return useEffectNode.parent.parent;
};

const getUpstreamReactVariables = (context, ref) =>
  getUpstreamVariables(
    context,
    ref,
    // Stop at the *usage* of `useState` - don't go up to the `useState` variable.
    // Not needed for props - they don't go "too far".
    // We could remove this and check for the `useState` variable instead,
    // but then all our tests need to import it so we can traverse up to it.
    // TODO: Probably some better way to combine these filters.
    (node) => !isUseState(node),
  ).filter(
    (variable) =>
      // Discount non-prop parameters
      isProp(variable) ||
      variable.defs.every((def) => def.type !== "Parameter"),
  );

Array.prototype.notEmptyEvery = function (predicate) {
  return this.length > 0 && this.every(predicate);
};
