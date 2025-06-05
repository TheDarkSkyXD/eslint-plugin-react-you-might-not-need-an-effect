import { MyRuleTester, js } from "./rule-tester.js";
import { messageIds } from "../src/messages.js";

new MyRuleTester().run("/empty-effect", {
  valid: [
    {
      name: "Valid effect",
      code: js`
        function Component() {
          useEffect(() => {
            console.log("Meow");
          }, []);
        }
      `,
    }
  ],
  invalid: [
    {
      name: "Empty effect",
      code: js`
        function Component() {
          useEffect(() => {}, []);
        }
      `,
      errors: [
        {
          messageId: messageIds.avoidEmptyEffect,
        },
      ],
    },
  ],
});
