// `build.js` will bundle everything into CJS.
// Would be nice to have it use `index.js` directly, but then `esbuild` doesn't
// seem capable of structuring the CJS export the way ESLint expects.
module.exports = require("./index.js").default;
