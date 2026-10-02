// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The pages ship as plain ES modules the browser loads directly, with no
// bundler or typechecker, so this is the only thing that reads them before a
// browser does. Self-contained for the same reason as storefront's: no
// `@eslint/js` or `globals` import that would lean on workspace hoisting. The
// globals below are the exact set these modules use.
const browserGlobals = [
   "console",
   "document",
   "getComputedStyle",
   "history",
   "location",
   "Node",
   "URLSearchParams",
   "window",
];

export default [
   {
      // Flat-config ignores resolve against the working directory, so these are
      // `**/`-prefixed to hold when the root `lint:examples` script runs eslint.
      ignores: [
         "**/examples/signals-research/public/vendor/**",
         "**/examples/signals-research/tests/**",
         "**/examples/signals-research/scripts/**",
      ],
   },
   {
      files: ["**/*.js"],
      languageOptions: {
         ecmaVersion: 2022,
         sourceType: "module",
         globals: {
            ...Object.fromEntries(browserGlobals.map((n) => [n, "readonly"])),
            // Loaded by each page before its module: the Publisher browser
            // runtime and the vendored Chart.js.
            Publisher: "readonly",
            Chart: "readonly",
         },
      },
      rules: {
         "no-undef": "error",
         "no-unused-vars": "error",
         "no-use-before-define": ["error", { variables: true, functions: false, classes: false }],
      },
   },
];
