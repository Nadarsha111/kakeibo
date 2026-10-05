// pdfjs-dist's fake-worker loader has a runtime-computed `import(this.workerSrc)`. Hermes' release
// compiler (hermesc) rejects any dynamic import() Metro can't resolve, which fails release/preview
// builds. That branch is never reached here (StatementImportService puts the worker on
// globalThis.pdfjsWorker first), so replace such calls in pdfjs-dist with a rejected promise.
function stubPdfjsDynamicImport({ types: t }) {
  return {
    visitor: {
      CallExpression(path, state) {
        const filename = state.filename || "";
        if (!/[\\/]node_modules[\\/]pdfjs-dist[\\/]/.test(filename)) return;
        if (path.node.callee.type !== "Import") return;
        const [arg] = path.node.arguments;
        if (arg && t.isStringLiteral(arg)) return;
        path.replaceWith(
          t.callExpression(t.memberExpression(t.identifier("Promise"), t.identifier("reject")), [
            t.newExpression(t.identifier("Error"), [
              t.stringLiteral("Dynamic import() is not supported in this environment"),
            ]),
          ])
        );
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind", unstable_transformImportMeta: true }],
      "nativewind/babel",
    ],
    plugins: [stubPdfjsDynamicImport, "@babel/plugin-transform-class-static-block"],
  };
};
