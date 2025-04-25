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
          // ✅ Good: calculated during rendering
          const fullName = firstName + ' ' + lastName;
          // ...
        }
      `,
    },
  ],
  invalid: [
    {
      code: js`
        function Form() {
          const [firstName, setFirstName] = useState('Taylor');
          const [lastName, setLastName] = useState('Swift');

          // 🔴 Avoid: redundant state and unnecessary Effect
          const [fullName, setFullName] = useState('');
          useEffect(() => {
            setFullName(firstName + ' ' + lastName);
          }, [firstName, lastName]);
          // ...
        }
      `,
      errors: [
        {
          message:
            'Avoid storing derived state. Compute "fullName" directly from other props or state during render.',
        },
      ],
    },
  ],
});
