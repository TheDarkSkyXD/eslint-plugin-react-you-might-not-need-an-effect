import { ruleTester } from "./rule-tester.js";
import { name, rule } from "../src/rule.js";
const js = String.raw;

ruleTester.run(name, rule, {
  valid: [
    {
      name: "Computed state from other state",
      code: js`
        function Form() {
          const [firstName, setFirstName] = useState('Taylor');
          const [lastName, setLastName] = useState('Swift');

          const fullName = firstName + ' ' + lastName;
        }
      `,
    },
    {
      name: "Computed state from props",
      code: js`
        function TodoList({ todos, filter }) {
          const [newTodo, setNewTodo] = useState('');
          const visibleTodos = getFilteredTodos(todos, filter);
        }
      `,
    },
    {
      name: "Two components with overlapping names",
      // Not a super realistic example
      code: js`
        function One() {
          const [data, setData] = useState();
        }

        function Two() {
          const setData = (data) => {
            console.log(data);
          }

          useEffect(() => {
            setData('hello');
          }, []);
        }
      `,
    },
    {
      name: "Reacting to library state changes that may not offer a callback",
      code: js`
        function Feed() {
          const { data: posts } = useQuery('/posts');
          const [scrollPosition, setScrollPosition] = useState(0);

          useEffect(() => {
            setScrollPosition(0);
          }, [posts]);
        }
      `,
    },
    {
      name: "Fetching external state on mount",
      code: js`
        function Form() {
          const [data, setData] = useState();

          useEffect(() => {
            fetchData().then((data) => {
              setData(data);
            });
          }, []);
        }
      `,
    },
    {
      name: "Fetching external state (network call) from state change",
      // Technically we could trigger the network call in `input.onChange`,
      // but that assumes we are okay with an uncontrolled input, which is often not the case.
      code: js`
        function Search() {
          const [query, setQuery] = useState();
          const [data, setData] = useState();

          useEffect(() => {
            fetchData(query).then((data) => {
              setData(data);
            });
          }, [query]);

          return (
            <input
              name="query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )
        }
      `,
    },
    {
      name: "Subscribing to external state",
      code: js`
        function Status() {
          const [status, setStatus] = useState();

          useEffect(() => {
            const unsubscribe = subscribeToStatus(topic, (status) => {
              setStatus(status);
            });

            return () => unsubscribe();
          }, [topic]);

          return <div>{status}</div>;
        }
      `,
    },
    {
      name: "Managing a timer",
      code: js`
        function Timer() {
          const [seconds, setSeconds] = useState(0);

          useEffect(() => {
            const interval = setInterval(() => {
              setSeconds((s) => s + 1);
            }, 1000);

            return () => { 
              clearInterval(interval); 
            }
          }, []);

          return <div>{seconds}</div>;
        }
      `,
    },
    {
      name: "Listening for window events",
      code: js`
        function WindowSize() {
          const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

          useEffect(() => {
            const handleResize = () => {
              setSize({ width: window.innerWidth, height: window.innerHeight });
            };

            window.addEventListener('resize', handleResize);

            return () => {
              window.removeEventListener('resize', handleResize);
            };
          }, []);

          return <div>{size.width} x {size.height}</div>;
        }
      `,
    },
    {
      name: "Imperatively syncing with the DOM",
      // Could technically play/pause the video in the `onClick` handler,
      // but the use of an effect to sync state is arguably more readable and a valid use.
      code: js`
        function VideoPlayer() {
          const [isPlaying, setIsPlaying] = useState(false);
          const videoRef = useRef();

          useEffect(() => {
            if (isPlaying) {
              videoRef.current.play();
            } else {
              videoRef.current.pause();
            }
          }, [isPlaying]);

          return <div>
            <video ref={videoRef} />
            <button onClick={() => setIsPlaying((p) => !p)} />
          </div>
        }
      `,
    },
    {
      name: "Saving to LocalStorage",
      code: js`
        function Notes() {
          const [notes, setNotes] = useState(() => {
            const savedNotes = localStorage.getItem('notes');
            return savedNotes ? JSON.parse(savedNotes) : [];
          });

          useEffect(() => {
            localStorage.setItem('notes', JSON.stringify(notes));
          }, [notes]);

          return <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        }
      `,
    },
    {
      name: "Logging/Analytics",
      code: js`
        function Nav() {
          const [page, setPage] = useState('home');

          useEffect(() => {
            logPageView(page);
          }, [page]);

          return (
            <div>
              <button onClick={() => setPage('home')}>Home</button>
              <button onClick={() => setPage('about')}>About</button>
              <div>{page}</div>
            </div>
          )
        }
      `,
    },
    {
      name: "Calling possibly unpure function in effect",
      code: js`
        function TodoList({ todos, filter }) {
          const [newTodo, setNewTodo] = useState("");

          const [visibleTodos, setVisibleTodos] = useState([]);
          useEffect(() => {
            // Semantically we can guess 'getFilteredTodos' is probably pure, but we can't be sure
            setVisibleTodos(getFilteredTodos(todos, filter));
          }, [todos, filter]);
        }
      `,
    },
  ],
  invalid: [
    {
      name: "Deriving state from other state",
      code: js`
        function Form() {
          const [firstName, setFirstName] = useState('Taylor');
          const [lastName, setLastName] = useState('Swift');

          const [fullName, setFullName] = useState('');
          useEffect(() => setFullName(firstName + ' ' + lastName), [firstName, lastName]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
        {
          messageId: "avoidDerivedState",
          data: { state: "fullName" },
        },
      ],
    },
    {
      name: "Deriving state from other state via intermediate variable",
      code: js`
        function Form() {
          const [firstName, setFirstName] = useState('Taylor');
          const [lastName, setLastName] = useState('Swift');

          const [fullName, setFullName] = useState('');
          useEffect(() => {
            const name = firstName + ' ' + lastName;
            setFullName(name) 
          }, [firstName, lastName]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
        {
          messageId: "avoidDerivedState",
          data: { state: "fullName" },
        },
      ],
    },
    {
      name: "Deriving state from other state via two intermediate variables",
      code: js`
        function Form() {
          const [firstName, setFirstName] = useState('Taylor');
          const [lastName, setLastName] = useState('Swift');

          const [fullName, setFullName] = useState('');
          useEffect(() => {
            const name = firstName + ' ' + lastName;
            const prefixedName = 'Dr. ' + name;
            setFullName(prefixedName) 
          }, [firstName, lastName]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
        {
          messageId: "avoidDerivedState",
          data: { state: "fullName" },
        },
      ],
    },
    {
      name: "Deriving state from props",
      code: js`
        function Form({ firstName, lastName }) {
          const [fullName, setFullName] = useState('');

          useEffect(() => {
            setFullName(firstName + ' ' + lastName);
          }, [firstName, lastName]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
        {
          messageId: "avoidDerivedState",
          data: { state: "fullName" },
        },
      ],
    },
    {
      // React docs recommend to first update state in render instead of an effect.
      // But then continue on to say that usually you can avoid the sync entirely by more wisely choosing your state.
      // So we'll just always call it derived state.
      name: "Syncing external prop changes to internal state",
      code: js`
        function List({ items }) {
          const [isReverse, setIsReverse] = useState(false);
          const [selection, setSelection] = useState(null);

          useEffect(() => {
            setSelection(items[0]);
          }, [items]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
        {
          messageId: "avoidDerivedState",
        },
      ],
    },
    {
      name: "Passing internal state to parent",
      code: js`
        const Child = ({ onFetched }) => {
          const [data, setData] = useState();

          useEffect(() => {
            onFetched(data);
          }, [onFetched, data]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
        {
          messageId: "avoidPassingStateToParent",
        },
      ],
    },
    {
      name: "Passing external state to parent",
      code: js`
        const Child = ({ onFetched }) => {
          const data = useSomeAPI();

          useEffect(() => {
            onFetched(data);
          }, [onFetched, data]);
        }
      `,
      errors: [
        {
          messageId: "avoidPassingStateToParent",
        },
      ],
    },
    //  TODO: How to detect this though? Not sure it's discernable from legit synchronization effects
    // {
    //   name: "Using state to handle an event",
    //   code: js`
    //     function Form() {
    //       const [name, setName] = useState();
    //       const [dataToSubmit, setDataToSubmit] = useState();
    //
    //       useEffect(() => {
    //         submitData(dataToSubmit);
    //       }, [dataToSubmit]);
    //
    //       return (
    //         <div>
    //           <input
    //             name="name"
    //             type="text"
    //             onChange={(e) => setName(e.target.value)}
    //           />
    //           <button onClick={() => setDataToSubmit({ name })}>Submit</button>
    //         </div>
    //       )
    //     }
    //   `,
    //   errors: [
    //     {
    //       messageId: "avoidEventHandler",
    //     },
    //   ],
    // },
    {
      name: "Using state to trigger no-arg prop callback",
      code: js`
        function Form({ onClose }) {
          const [name, setName] = useState();
          const [isOpen, setIsOpen] = useState(true);

          useEffect(() => {
            onClose();
          }, [isOpen]);

          return (
            <button onClick={() => setIsOpen(false)}>Submit</button>
          )
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
      ],
    },
    {
      name: "Resetting all state when a prop changes",
      code: js`
        function ProfilePage({ userId }) {
          const [user, setUser] = useState(null);
          const [comment, setComment] = useState('type something');

          useEffect(() => {
            setUser(null);
            setComment('type something');
          }, [userId]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
        {
          messageId: "avoidResettingStateFromProps",
        },
        {
          messageId: "avoidChainingState",
        },
        {
          messageId: "avoidChainingState",
        },
      ],
    },
    {
      name: "Deriving conditional state",
      code: js`
        function Form() {
          const [error, setError] = useState();
          const [result, setResult] = useState();

          useEffect(() => {
            if (result.data) {
              setError(null);
            }
          }, [result]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
        {
          messageId: "avoidChainingState",
        },
      ],
    },
    {
      name: "Deriving state from props via function",
      code: js`
        function DoubleList({ list }) {
          const [doubleList, setDoubleList] = useState([]);

          useEffect(() => {
            // list.concat is a call expression, but it's
            // considered a prop call, thus still internal
            setDoubleList(list.concat(list));
          }, [list]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
        {
          messageId: "avoidDerivedState",
          data: { state: "doubleList" },
        },
      ],
    },
    {
      name: "Deriving state from other state via function",
      code: js`
        function DoubleList() {
          const [list, setList] = useState([]);
          const [doubleList, setDoubleList] = useState([]);

          useEffect(() => {
            setDoubleList(list.concat(list));
          }, [list]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
        {
          messageId: "avoidDerivedState",
          data: { state: "doubleList" },
        },
      ],
    },
    {
      name: "Mutating state in effect",
      code: js`
        function DoubleList() {
          const [list, setList] = useState([]);
          const [doubleList, setDoubleList] = useState([]);

          useEffect(() => {
            doubleList.push(...list);
          }, [list]);
        }
      `,
      errors: [
        {
          messageId: "avoidInternalEffect",
        },
      ],
    },
  ],
});
