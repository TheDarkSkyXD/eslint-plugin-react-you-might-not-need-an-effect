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
        }
      `,
    },
  ],
  invalid: [
    // Block statement `useEffect`
    {
      code: js`
        function Form() {
          const [firstName, setFirstName] = useState('Taylor');
          const [lastName, setLastName] = useState('Swift');

          const [fullName, setFullName] = useState('');
          useEffect(() => {
            setFullName(firstName + ' ' + lastName);
          }, [firstName, lastName]);
        }
      `,
      output: js`
        function Form() {
          const [firstName, setFirstName] = useState('Taylor');
          const [lastName, setLastName] = useState('Swift');

          const fullName = firstName + ' ' + lastName;
          useEffect(() => {
            
          }, [firstName, lastName]);
        }
      `,
      errors: [
        {
          message:
            'Avoid storing derived state. Compute "fullName" directly from other props or state during render.',
        },
      ],
    },
    // TODO: Arrow function `useEffect`
    // {
    //   code: js`
    //     function Form() {
    //       const [firstName, setFirstName] = useState('Taylor');
    //       const [lastName, setLastName] = useState('Swift');
    //
    //       const [fullName, setFullName] = useState('');
    //       useEffect(() => setFullName(firstName + ' ' + lastName), [firstName, lastName]);
    //     }
    //   `,
    //   output: js`
    //     function Form() {
    //       const [firstName, setFirstName] = useState('Taylor');
    //       const [lastName, setLastName] = useState('Swift');
    //
    //       const fullName = firstName + ' ' + lastName;
    //       useEffect(() => , [firstName, lastName]);
    //     }
    //   `,
    //   errors: [
    //     {
    //       message:
    //         'Avoid storing derived state. Compute "fullName" directly from other props or state during render.',
    //     },
    //   ],
    // },
  ],
});
