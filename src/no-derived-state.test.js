import { NormalizedWhitespaceRuleTester } from "./normalized-whitespace-rule-tester.js";
import noDerivedStateRule from "./no-derived-state.js";
const js = String.raw;

new NormalizedWhitespaceRuleTester().run(
  "no-derived-state",
  noDerivedStateRule,
  {
    valid: [
      {
        code: js`
        function Form() {
          const [firstName, setFirstName] = useState('Taylor');
          const [lastName, setLastName] = useState('Swift');

          const fullName = firstName + ' ' + lastName;
        }`,
      },
      {
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
    ],
  },
);
