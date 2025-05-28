import { MyRuleTester, js } from "./rule-tester.js";
import { messageIds } from "../src/messages.js";

new MyRuleTester().run("/initializing-state", {
  valid: [
    {
      name: "With external state",
      code: js`
        function MyComponent() {
          const [state, setState] = useState();

          useEffect(() => {
            const data = fetch("/api/data");
            setState(data);
          }, []);
        }
      `
    }
  ],
  invalid: [
    {
      name: "With internal state",
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
      name: "With internal state in an otherwise legit effect",
      code: js`
        function MyComponent() {
          const [state, setState] = useState();

          useEffect(() => {
            console.log("Hello");
            setState("World");
          }, []);
        }
      `,
      errors: [
        {
          messageId: messageIds.avoidInitializingState,
          data: { state: "state" },
        },
      ],
    }
  ],
});
