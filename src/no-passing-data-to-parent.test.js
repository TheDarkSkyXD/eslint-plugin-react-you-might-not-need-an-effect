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
    // Function component
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
    // Arrow function component
    {
      code: js`
        const Child = ({ onFetched }) => {
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
    // Non-destructured props
    // {
    //   code: js`
    //     const Child = (props) => {
    //       const data = useSomeAPI();
    //
    //       useEffect(() => {
    //         props.onFetched(data);
    //       }, [props.onFetched, data]);
    //     }`,
    //   errors: [
    //     {
    //       message:
    //         'React state should flow from parents to their children; never from children to parents. Consider lifting "data" into the parent.',
    //     },
    //   ],
    // },
    // Wrapped in if statement
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
    ,
  ],
});
