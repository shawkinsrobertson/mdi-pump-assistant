// installProcessStreamPolyfill() is a no-op in Jest itself (real Node
// already has process.stderr/stdout), so these tests exercise the
// exported function directly against a deliberately-stripped global
// `process`, rather than relying on the module's own top-level
// self-install call.
const { installProcessStreamPolyfill } = require('../polyfillProcessStreams');

describe('installProcessStreamPolyfill', () => {
  let originalProcess;

  beforeEach(() => {
    originalProcess = global.process;
  });

  afterEach(() => {
    global.process = originalProcess;
  });

  it('adds a working stderr.write that forwards to console.error', () => {
    global.process = {};
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    installProcessStreamPolyfill();
    const result = global.process.stderr.write('something went low\n');

    expect(result).toBe(true);
    expect(spy).toHaveBeenCalledWith('something went low');
    spy.mockRestore();
  });

  it('adds a working stdout.write that forwards to console.log', () => {
    global.process = {};
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    installProcessStreamPolyfill();
    global.process.stdout.write('hello');

    expect(spy).toHaveBeenCalledWith('hello');
    spy.mockRestore();
  });

  it('creates process entirely if it does not exist at all', () => {
    // @ts-ignore - deliberately simulating a missing global for this test
    delete global.process;

    expect(() => installProcessStreamPolyfill()).not.toThrow();
    expect(typeof global.process.stderr.write).toBe('function');
    expect(typeof global.process.stdout.write).toBe('function');
  });

  it('leaves an already-present stderr/stdout untouched', () => {
    const existingStderr = { write: jest.fn() };
    const existingStdout = { write: jest.fn() };
    global.process = { stderr: existingStderr, stdout: existingStdout };

    installProcessStreamPolyfill();

    expect(global.process.stderr).toBe(existingStderr);
    expect(global.process.stdout).toBe(existingStdout);
  });
});
