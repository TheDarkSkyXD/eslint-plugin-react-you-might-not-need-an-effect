import { MyRuleTester, js } from "./rule-tester.js";
import { messageIds } from "../src/messages.js";

new MyRuleTester().run("/initializing-state", {
  invalid: [
    {
      name: "Initializing state in an effect",
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
  ],
});
