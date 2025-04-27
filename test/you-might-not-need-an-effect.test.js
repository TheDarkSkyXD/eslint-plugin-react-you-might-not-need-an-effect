import { RuleTester } from "eslint";
import youMightNotNeedAnEffectRule from "../src/you-might-not-need-an-effect.js";
const js = String.raw;

import "./normalize-test-whitespace.js";

new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
}).run("you-might-not-need-an-effect", youMightNotNeedAnEffectRule, {
  valid: [
    {
      name: "Computed state from other state",
      code: js`
          function Form() {
            const [firstName, setFirstName] = useState('Taylor');
            const [lastName, setLastName] = useState('Swift');

            const fullName = firstName + ' ' + lastName;
          }`,
    },
    {
      name: "Computed state from props",
      code: js`
          function TodoList({ todos, filter }) {
            const [newTodo, setNewTodo] = useState('');
            const visibleTodos = getFilteredTodos(todos, filter);
          }`,
    },
    {
      name: "Two components with overlapping names",
      // Not a super realistic example
      code: js`
          function One() {
            const [data, setData] = useState();
          }

          function Two() {
            const setData = (data) => {
              console.log(data);
            }

            useEffect(() => {
              setData('hello');
            }, []);
          }
        `,
    },
  ],
  invalid: [
    {
      name: "Derived state from other state in single-statement body",
      code: js`
          function Form() {
            const [firstName, setFirstName] = useState('Taylor');
            const [lastName, setLastName] = useState('Swift');

            const [fullName, setFullName] = useState('');
            useEffect(() => {
              setFullName(firstName + ' ' + lastName);
            }, [firstName, lastName]);
          }`,
      errors: [
        {
          messageId: "avoidDerivedState",
          data: { state: "fullName" },
        },
      ],
    },
    {
      name: "Derived state from other state in multi-statement body",
      code: js`
          function Form() {
            const [firstName, setFirstName] = useState('Taylor');
            const [lastName, setLastName] = useState('Swift');

            const [fullName, setFullName] = useState('');
            useEffect(() => {
              setFullName(firstName + ' ' + lastName);
              console.log('meow');
            }, [firstName, lastName]);
          }`,
      errors: [
        {
          messageId: "avoidDerivedState",
          data: { state: "fullName" },
        },
      ],
    },
    {
      name: "Derived state from other state in one-liner body",
      code: js`
          function Form() {
            const [firstName, setFirstName] = useState('Taylor');
            const [lastName, setLastName] = useState('Swift');

            const [fullName, setFullName] = useState('');
            useEffect(() => setFullName(firstName + ' ' + lastName), [firstName, lastName]);
          }`,
      errors: [
        {
          messageId: "avoidDerivedState",
          data: { state: "fullName" },
        },
      ],
    },
    {
      name: "Derived state from props",
      code: js`
          function TodoList({ todos, filter }) {
            const [newTodo, setNewTodo] = useState("");

            const [visibleTodos, setVisibleTodos] = useState([]);
            useEffect(() => {
              setVisibleTodos(getFilteredTodos(todos, filter));
            }, [todos, filter]);
          }`,
      errors: [
        {
          messageId: "avoidDerivedState",
          data: { state: "visibleTodos" },
        },
        // Triggered by `getFilteredTodos`...
        // TODO: Is that good?
        // I guess so? But maybe not for all cases...
        { messageId: "avoidDelayedSideEffect" },
      ],
    },
    {
      name: "State passed to parent via non-destructured props",
      code: js`
          const Child = (props) => {
            const data = useSomeAPI();

            useEffect(() => {
              props.onFetched(data);
            }, [props.onFetched, data]);
          }`,
      errors: [
        {
          messageId: "avoidPassingIntermediateDataToParent",
        },
      ],
    },
    {
      name: "Arbitrarily deep member access in useEffect body and dependencies",
      code: js`
          const Child = ({ onFetched }) => {
            const data = useSomeAPI();

            useEffect(() => onFetched(data.result.value), [onFetched, data.result.value]);
          }`,
      errors: [
        {
          messageId: "avoidPassingIntermediateDataToParent",
        },
      ],
    },
    {
      name: "Arbitrarily deep nesting in useEffect body",
      code: js`
          function Child({ onFetched }) {
            const data = useSomeAPI();

            useEffect(() => {
              if (data) {
                if (data.value) {
                  onFetched(data);
                }
              }
            }, [onFetched, data]);
          }`,
      errors: [
        {
          messageId: "avoidPassingIntermediateDataToParent",
        },
      ],
    },
    {
      name: "Using state to trigger a delayed side effect",
      code: js`
          const submitPostRequest = (data) => {
          }

          function Form() {
            const [name, setName] = useState();
            const [dataToSubmit, setDataToSubmit] = useState();

            useEffect(() => {
              submitPostRequest(dataToSubmit);
            }, [dataToSubmit]);

            return (
              <div>
                <input
                  name="name"
                  type="text"
                  onChange={(e) => setName(e.target.value)}
                />
                <button onClick={() => setDataToSubmit({ name })}>Submit</button>
              </div>
            )
          }`,
      errors: [{ messageId: "avoidDelayedSideEffect" }],
    },
    {
      name: "Using state to trigger a prop callback with final state",
      code: js`
        function Form({ onSubmit }) {
          const [name, setName] = useState();
          const [dataToSubmit, setDataToSubmit] = useState();

          useEffect(() => {
            onSubmit(dataToSubmit);
          }, [dataToSubmit]);

          return (
            <div>
              <input
                name="name"
                type="text"
                onChange={(e) => setName(e.target.value)}
              />
              <button onClick={() => setDataToSubmit({ name })}>Submit</button>
            </div>
          )
        }`,
      // Note we don't expect this to trigger the "intermediate state" error,
      // because passing final state is a valid use case.
      errors: [
        {
          messageId: "avoidDelayedSideEffect",
        },
      ],
    },
    {
      name: "Using state to trigger no-arg prop callback",
      code: js`
          function Form({ onClose }) {
            const [name, setName] = useState();
            const [isOpen, setIsOpen] = useState(true);

            useEffect(() => {
              onClose();
            }, [isOpen]);

            return (
              <button onClick={() => setIsOpen(false)}>Submit</button>
            )
          }`,
      errors: [
        {
          messageId: "avoidDelayedSideEffect",
        },
      ],
    },
    {
      name: "Resetting state when a prop changes",
      // The `useEffect` triggers a state change, but it's not derived state.
      code: js`
          function ProfilePage({ userId }) {
            const [comment, setComment] = useState('');

            useEffect(() => {
              setComment('');
            }, [userId]);
          }`,
      // TODO: More accurately, should be a separate message to set `key` on the component instead of resetting local state. I think only when *all* local state is reset. Otherwise React docs advise updating state during render.
      errors: [
        {
          messageId: "avoidDelayedSideEffect",
        },
      ],
    },
    {
      name: "Resetting or deriving state when other state changes",
      code: js`
        function Form() {
          const [error, setError] = useState();
          const result = useSomeAPI();

          useEffect(() => {
            if (result.data) {
              setError(null);
            } else if (result.error) {
              setError(result.error);
            }
          }, [result]);
        }`,
      errors: [
        {
          // Because `setError` is called with an argument that's not in the dependencies
          messageId: "avoidDelayedSideEffect",
        },
        {
          messageId: "avoidDerivedState",
        },
      ],
    },
    // TODO:
    // {
    //   name: "Redeclared dependency used in args",
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
});
