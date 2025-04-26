export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow calling an event handler in a useEffect.",
      // https://react.dev/learn/you-might-not-need-an-effect#sending-a-post-request
      url: "https://react.dev/learn/you-might-not-need-an-effect",
    },
    fixable: "code",
    messages: {
      avoidEventHandler:
        'Avoid calling an event handler in a useEffect. Instead, call "{{handlerFn}}" directly.',
    },
  },
  create: (context) => {
    // TODO:
  },
};
