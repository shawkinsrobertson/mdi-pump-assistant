// oref0's vendored files use Node-CLI-style process.stderr.write(...) /
// process.stdout.write(...) calls for verbose debug logging (see e.g.
// determine-basal.js, cob.js, autosens.js, iob/history.js — all
// unmodified upstream code). Hermes (React Native's JS engine) provides a
// minimal `process` global but no stdout/stderr streams, so the first such
// call on-device throws "Cannot read property 'write' of undefined".
//
// This is a pure runtime-environment gap, not an algorithm bug — the same
// category as the moment.js/module-format adaptations from Step 3 ("if a
// test fails, the environment shim is wrong, not the algorithm") — so it's
// patched here with a stream-like shim rather than editing any vendored
// file. Must run before any oref-vendor code does; see index.ts, which
// imports this first for its side effect.

interface WritableStream {
  write: (chunk: string) => boolean;
}

function makeStream(log: (msg: string) => void): WritableStream {
  return {
    write(chunk: string) {
      log(String(chunk).replace(/\n$/, ''));
      return true;
    },
  };
}

export function installProcessStreamPolyfill(): void {
  const g = globalThis as { process?: Record<string, unknown> };
  if (!g.process) {
    g.process = {};
  }
  if (!g.process.stderr) {
    g.process.stderr = makeStream((msg) => console.error(msg));
  }
  if (!g.process.stdout) {
    g.process.stdout = makeStream((msg) => console.log(msg));
  }
}

installProcessStreamPolyfill();
