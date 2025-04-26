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
      name: "Function component",
      code: js`
        function Child({ onFetched }) {
          const data = useSomeAPI();

          useEffect(() => {
            onFetched(data);
          }, [onFetched, data]);
        }`,
      errors: [
        {
          messageId: "avoidPassingDataToParent",
          data: { data: "data" },
        },
      ],
    },
    {
      name: "Arrow function component",
      code: js`
        const Child = ({ onFetched }) => {
          const data = useSomeAPI();

          useEffect(() => {
            onFetched(data);
          }, [onFetched, data]);
        }`,
      errors: [
        {
          messageId: "avoidPassingDataToParent",
          data: { data: "data" },
        },
      ],
    },
    {
      name: "Non-destructured props",
      code: js`
        const Child = (props) => {
          const data = useSomeAPI();

          useEffect(() => {
            props.onFetched(data);
          }, [props.onFetched, data]);
        }`,
      errors: [
        {
          messageId: "avoidPassingDataToParent",
          data: { data: "data" },
        },
      ],
    },
    {
      name: "One-liner `useEffect` body",
      code: js`
        const Child = ({ onFetched }) => {
          const data = useSomeAPI();

          useEffect(() => onFetched(data), [onFetched, data]);
        }`,
      errors: [
        {
          messageId: "avoidPassingDataToParent",
          data: { data: "data" },
        },
      ],
    },
    {
      name: "Member access in dependencies",
      code: js`
        const Child = ({ onFetched }) => {
          const data = useSomeAPI();

          useEffect(() => onFetched(data.result), [onFetched, data.result]);
        }`,
      errors: [
        {
          messageId: "avoidPassingDataToParent",
          data: { data: "data" },
        },
      ],
    },
    {
      name: "Nested member access in dependencies",
      code: js`
        const Child = ({ onFetched }) => {
          const data = useSomeAPI();

          useEffect(() => onFetched(data.result.value), [onFetched, data.result.value]);
        }`,
      errors: [
        {
          messageId: "avoidPassingDataToParent",
          data: { data: "data" },
        },
      ],
    },
    // TODO:
    // {
    //   name: "Nested in if block",
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
    ,
    ,
  ],
});
