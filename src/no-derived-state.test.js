import { RuleTester } from "eslint";
import noDerivedStateRule from "./no-derived-state.js";
const js = String.raw;

new RuleTester().run("no-derived-state", noDerivedStateRule, {
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
  ],
  invalid: [
    {
      name: "Derived state from other state (single-statement body; removed entirely)",
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
      name: "Derived state from other state (multi-statement body, only the setter is removed)",
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
      name: "Derived state from other state (one-liner body; removed entirely)",
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
    // TODO: could suggest `useMemo`
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
});
