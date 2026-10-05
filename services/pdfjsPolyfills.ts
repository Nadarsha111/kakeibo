// Must be imported before pdfjs-dist. Its legacy build bundles core-js's DOMException polyfill,
// which reads `DOMException.prototype` at module-evaluation time assuming the browser global
// exists. Hermes has no DOMException, so without this the import throws "Cannot read property
// 'prototype' of undefined" and takes the whole importing route down with it.
if (typeof (globalThis as any).DOMException === "undefined") {
  class DOMException extends Error {
    code = 0;
    constructor(message = "", name = "Error") {
      super(message);
      this.name = name;
    }
  }
  (globalThis as any).DOMException = DOMException;
}

// pdfjs's in-process ("fake") worker passes every message through `structuredClone`, which Hermes
// doesn't provide - without this, every getDocument() rejects with "structuredClone is not
// defined". Everything runs on one thread, so transferred ArrayBuffers are handed over as-is
// (a transfer moves ownership anyway); everything else is deep-copied like the real thing.
if (typeof (globalThis as any).structuredClone === "undefined") {
  const structuredClone = (value: any, options?: { transfer?: any[] } | null) => {
    const transferred = new Set(options?.transfer ?? []);
    const seen = new Map<any, any>();

    const clone = (v: any): any => {
      if (v === null || (typeof v !== "object" && typeof v !== "function")) return v;
      if (typeof v === "function") {
        throw new (globalThis as any).DOMException(`${v} could not be cloned.`, "DataCloneError");
      }
      if (seen.has(v)) return seen.get(v);

      let out: any;
      if (v instanceof ArrayBuffer) {
        out = transferred.has(v) ? v : v.slice(0);
      } else if (ArrayBuffer.isView(v)) {
        const buffer = clone(v.buffer);
        const View = v.constructor as any;
        out = v instanceof DataView
          ? new DataView(buffer, v.byteOffset, v.byteLength)
          : new View(buffer, v.byteOffset, (v as any).length);
      } else if (v instanceof Date) {
        out = new Date(v.getTime());
      } else if (v instanceof RegExp) {
        out = new RegExp(v.source, v.flags);
      } else if (v instanceof Map) {
        out = new Map();
        seen.set(v, out);
        v.forEach((val, key) => out.set(clone(key), clone(val)));
        return out;
      } else if (v instanceof Set) {
        out = new Set();
        seen.set(v, out);
        v.forEach((val) => out.add(clone(val)));
        return out;
      } else if (Object.prototype.toString.call(v) === "[object Error]") {
        // Only genuine Errors. pdfjs's exceptions merely inherit from an Error *instance*, so like
        // the native clone they fall through to the plain-object case and keep extras like `code`.
        out = new Error(v.message);
        out.name = v.name;
        if (v.stack) out.stack = v.stack;
      } else if (Array.isArray(v)) {
        out = new Array(v.length);
        seen.set(v, out);
        v.forEach((item, i) => (out[i] = clone(item)));
        return out;
      } else {
        out = {};
        seen.set(v, out);
        for (const key of Object.keys(v)) out[key] = clone(v[key]);
        return out;
      }
      seen.set(v, out);
      return out;
    };

    return clone(value);
  };
  (globalThis as any).structuredClone = structuredClone;
}

export {};
