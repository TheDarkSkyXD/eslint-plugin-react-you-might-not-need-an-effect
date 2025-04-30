import { ruleTester } from "./rule-tester.js";
import youMightNotNeedAnEffectRule from "../src/you-might-not-need-an-effect.js";
const js = String.raw;

const code = ({
  componentDeclaration = js`const DoubleCounter = () =>`,
  effectBody = js`setDoubleCount(count * 2)`,
  effectDeps = js`[count]`,
}) => js`
  ${componentDeclaration} {
    const [count, setCount] = useState(0);
    const [doubleCount, setDoubleCount] = useState(0);

    useEffect(() => ${effectBody}, ${effectDeps});

    return (
      <div>
        <p>Count: {count}</p>
        <p>Double Count: {doubleCount}</p>
      </div>
    );
  }
`;

// Syntax variations that are semantically equivalent
// TODO: Could dynamically generate variations: https://mochajs.org/#dynamically-generating-tests
// Could be overkill; they shouldn't affect each other (supposedly, but I guess that's the point of tests!)
ruleTester.run(
  "you-might-not-need-an-effect/syntax-variations",
  youMightNotNeedAnEffectRule,
  {
    valid: [],
    invalid: [
      {
        name: "Function component",
        code: code({
          componentDeclaration: js`function DoubleCounter()`,
        }),
        errors: 2,
      },
      {
        name: "Arrow function component",
        code: code({
          componentDeclaration: js`const DoubleCounter = () =>`,
        }),
        errors: 2,
      },
      {
        name: "Effect one-liner body",
        code: code({
          componentDeclaration: js`const AvoidDuplicateTest = () =>`,
          effectBody: js`setDoubleCount(count * 2)`,
        }),
        errors: 2,
      },
      {
        name: "Effect single-statement body",
        code: code({
          effectBody: js`{ setDoubleCount(count * 2); }`,
        }),
        errors: 2,
      },
      {
        name: "Effect multi-statement body",
        code: code({
          effectBody: js`{ setDoubleCount(count * 2); setDoubleCount(count * 2); }`,
        }),
        errors: 3,
      },
      {
        name: "Non-destructured props",
        code: code({
          componentDeclaration: js`function DoubleCounter(props)`,
          effectBody: js`setDoubleCount(props.count * 2)`,
          // TODO: Do we need to check just `props` in the deps too? Or does `exhaustive-deps` warn about that?
          effectDeps: js`[props.count]`,
        }),
        errors: 2,
      },
      {
        name: "Destructured props",
        code: code({
          componentDeclaration: js`function DoubleCounter({ propCount })`,
          effectBody: js`setDoubleCount(propCount * 2)`,
          effectDeps: js`[propCount]`,
        }),
        errors: 2,
      },
      {
        name: "Renamed destructured props",
        code: code({
          componentDeclaration: js`function DoubleCounter({ count: countProp })`,
          effectBody: js`setDoubleCount(countProp * 2)`,
          effectDeps: js`[countProp]`,
        }),
        errors: 2,
      },
      {
        name: "Arbitrarily deep member access in effect",
        code: code({
          componentDeclaration: js`function DoubleCounter(props)`,
          effectBody: js`setDoubleCount(props.nested.count * 2)`,
          effectDeps: js`[props.nested.count]`,
        }),
        errors: 2,
      },
      {
        name: "Objects stored in state",
        code: js`
          function DoubleCounter() {
            const [count, setCount] = useState({ value: 0 });
            const [doubleCount, setDoubleCount] = useState({ value: 0 });

            useEffect(() => {
              setDoubleCount({ value: count.value * 2 });
            }, [count]);

            return (
              <div>
                <p>Count: {count.value}</p>
                <p>Double Count: {doubleCount.value}</p>
              </div>
            );
          }
        `,
        errors: 2,
      },
      {
        // `exhaustive-deps` doesn't enforce member access in the deps
        name: "Member access in effect body but not in deps",
        code: code({
          componentDeclaration: js`function DoubleCounter(props)`,
          effectBody: js`setDoubleCount(props.count * 2)`,
          effectDeps: js`[props]`,
        }),
        errors: 2,
      },
      {
        name: "Arbitrarily deep nested scopes in effect body",
        code: code({
          effectBody: js`
            {
              if (count > 10) {
                if (count > 100) {
                  setDoubleCount(count * 4);
                } else {
                  setDoubleCount(count * 2);
                }
              } else {
                setDoubleCount(count);
              }
            }
          `,
        }),
        errors: 4,
      },
      // TODO:
      // {
      //   name: "Shadowed dependency used in args",
      //   code: js`
      //     function Child({ onFetched }) {
      //       const data = useSomeAPI();
      //
      //       useEffect(() => {
      //         const value = data.value;
      //         onFetched(value);
      //       }, [onFetched, data]);
      //     }`,
      // },
    ],
  },
);
