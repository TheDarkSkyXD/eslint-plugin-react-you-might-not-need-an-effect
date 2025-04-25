import { RuleTester } from "eslint";
import noPassingDataToParent from "./no-passing-data-to-parent.js";
const js = String.raw;

new RuleTester().run("no-passing-data-to-parent", noPassingDataToParent, {
  valid: [
    {
      code: js`
        function Child({ data }) {
        }`,
    },
  ],
  invalid: [
    {
      code: js`
        function Child({ onFetched }) {
          const data = useSomeAPI();

          useEffect(() => {
            onFetched(data);
          }, [onFetched, data]);
        }`,
      errors: [
        {
          message:
            'React state should flow from parents to their children; never from children to parents. Consider lifting "data" into the parent.',
        },
      ],
    },
    // {
    //   code: js`
    //     function Child({ onFetched }) {
    //       const data = useSomeAPI();
    //
    //       useEffect(() => {
    //         if (data) {
    //           onFetched(data);
    //         }
    //       }, [onFetched, data]);
    //     }`,
    //   errors: [
    //     {
    //       message:
    //         'React state should flow from parents to their children; never from children to parents. Consider lifting "data" into the parent.',
    //     },
    //   ],
    // },
  ],
});
