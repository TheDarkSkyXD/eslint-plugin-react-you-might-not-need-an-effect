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
    // https://react.dev/learn/you-might-not-need-an-effect#updating-state-based-on-props-or-state
    {
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
          useEffect(() => {
            
          }, [firstName, lastName]);
        }`,
      errors: [
        {
          message:
            'Avoid storing derived state. Compute "fullName" directly from other props or state during render.',
        },
      ],
    },
    // https://react.dev/learn/you-might-not-need-an-effect#caching-expensive-calculations
    // TODO: could suggest `useMemo`
    {
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
          useEffect(() => {
            
          }, [todos, filter]);
        }`,
      errors: [
        {
          message:
            'Avoid storing derived state. Compute "visibleTodos" directly from other props or state during render.',
        },
      ],
    },
  ],
});
