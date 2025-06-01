import { MyRuleTester, js } from "./rule-tester.js";
import { messageIds } from "../src/messages.js";

new MyRuleTester().run("/initializing-state", {
  valid: [
    {
      name: "Initializing state to external data",
      code: js`
        function MyComponent() {
          const [state, setState] = useState();

          useEffect(() => {
            fetch("https://api.example.com/data")
              .then(response => response.json())
              .then(data => setState(data));
          }, []);
        }
      `,
    },
  ],
  invalid: [
    {
      name: "Initializing state to literal",
      code: js`
        function MyComponent() {
          const [state, setState] = useState();

          useEffect(() => {
            setState("Hello");
          }, []);

          return <div>{state}</div>;
        }
      `,
      errors: [
        {
          messageId: messageIds.avoidInternalEffect,
        },
        {
          messageId: messageIds.avoidInitializingState,
          data: { state: "state" },
        },
      ],
    },
    {
      name: "Initializing state to internal data",
      code: js`
        function MyComponent() {
          const [state, setState] = useState();
          const [otherState, setOtherState] = useState('Meow');

          useEffect(() => {
            setState(otherState);
          }, []);
        }
      `,
      errors: [
        {
          messageId: messageIds.avoidInternalEffect,
        },
        {
          messageId: messageIds.avoidDerivedState,
        },
        // TODO: Should also warn this?
        // {
        //   messageId: messageIds.avoidInitializingState,
        //   data: { state: "state" },
        // },
      ],
    },
  ],
});
