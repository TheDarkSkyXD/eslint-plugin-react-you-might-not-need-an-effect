import { RuleTester } from "eslint";
import youMightNotNeedAnEffectRule from "../src/you-might-not-need-an-effect.js";
const js = String.raw;

import "./normalize-test-whitespace.js";

new RuleTester().run(
  "you-might-not-need-an-effect",
  youMightNotNeedAnEffectRule,
  {
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
        name: "Two components with overlapping names should not affect each other",
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
      },
    ],
    invalid: [
      {
        name: "Derived state from other state (single-statement body; replaced entirely)",
        code: js`
          function Form() {
            const [firstName, setFirstName] = useState('Taylor');
            const [lastName, setLastName] = useState('Swift');

            const [fullName, setFullName] = useState('');
            useEffect(() => {
              setFullName(firstName + ' ' + lastName);
            }, [firstName, lastName]);
          }`,
        output: js`
          function Form() {
            const [firstName, setFirstName] = useState('Taylor');
            const [lastName, setLastName] = useState('Swift');

            const fullName = firstName + ' ' + lastName;
          }`,
        errors: [
          {
            messageId: "avoidDerivedState",
            data: { state: "fullName" },
          },
        ],
      },
      {
        name: "Derived state from other state (multi-statement body; only the setter is removed, computed state is placed above `useEffect`)",
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
        output: js`
          function Form() {
            const [firstName, setFirstName] = useState('Taylor');
            const [lastName, setLastName] = useState('Swift');

            const fullName = firstName + ' ' + lastName;
            useEffect(() => {
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
        name: "Derived state from other state (one-liner body; replaced entirely)",
        code: js`
          function Form() {
            const [firstName, setFirstName] = useState('Taylor');
            const [lastName, setLastName] = useState('Swift');

            const [fullName, setFullName] = useState('');
            useEffect(() => setFullName(firstName + ' ' + lastName), [firstName, lastName]);
          }`,
        output: js`
          function Form() {
            const [firstName, setFirstName] = useState('Taylor');
            const [lastName, setLastName] = useState('Swift');

            const fullName = firstName + ' ' + lastName;
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
        output: js`
          function TodoList({ todos, filter }) {
            const [newTodo, setNewTodo] = useState("");

            const visibleTodos = getFilteredTodos(todos, filter);
          }`,
        errors: [
          {
            messageId: "avoidDerivedState",
            data: { state: "visibleTodos" },
          },
        ],
      },
      {
        name: "Function component",
        code: js`
          function Child({ onFetched }) {
            const data = useSomeAPI();

            useEffect(() => {
              onFetched(data);
            }, [onFetched, data]);
          }`,
        errors: [
          {
            messageId: "avoidPassingDataToParent",
            data: { data: "data" },
          },
        ],
      },
      {
        name: "Arrow function component",
        code: js`
          const Child = ({ onFetched }) => {
            const data = useSomeAPI();

            useEffect(() => {
              onFetched(data);
            }, [onFetched, data]);
          }`,
        errors: [
          {
            messageId: "avoidPassingDataToParent",
            data: { data: "data" },
          },
        ],
      },
      {
        name: "Non-destructured props",
        code: js`
          const Child = (props) => {
            const data = useSomeAPI();

            useEffect(() => {
              props.onFetched(data);
            }, [props.onFetched, data]);
          }`,
        errors: [
          {
            messageId: "avoidPassingDataToParent",
            data: { data: "data" },
          },
        ],
      },
      {
        name: "One-liner `useEffect` body",
        code: js`
          const Child = ({ onFetched }) => {
            const data = useSomeAPI();

            useEffect(() => onFetched(data), [onFetched, data]);
          }`,
        errors: [
          {
            messageId: "avoidPassingDataToParent",
            data: { data: "data" },
          },
        ],
      },
      {
        name: "Member access in dependencies",
        code: js`
          const Child = ({ onFetched }) => {
            const data = useSomeAPI();

            useEffect(() => onFetched(data.result), [onFetched, data.result]);
          }`,
        errors: [
          {
            messageId: "avoidPassingDataToParent",
            data: { data: "data" },
          },
        ],
      },
      {
        name: "Double member access in dependencies",
        code: js`
          const Child = ({ onFetched }) => {
            const data = useSomeAPI();

            useEffect(() => onFetched(data.result.value), [onFetched, data.result.value]);
          }`,
        errors: [
          {
            messageId: "avoidPassingDataToParent",
            data: { data: "data" },
          },
        ],
      },
      {
        name: "Nested in if block",
        code: js`
          function Child({ onFetched }) {
            const data = useSomeAPI();

            useEffect(() => {
              if (data) {
                onFetched(data);
              }
            }, [onFetched, data]);
          }`,
        errors: [
          {
            messageId: "avoidPassingDataToParent",
            data: { data: "data" },
          },
        ],
      },
      {
        name: "Nested in two if blocks",
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
            messageId: "avoidPassingDataToParent",
            data: { data: "data" },
          },
        ],
      },
    ],
  },
);
