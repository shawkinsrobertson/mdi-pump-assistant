import { act, create } from 'react-test-renderer';
import { usePrediction } from '../usePrediction';

jest.mock('../runPrediction', () => ({ runPrediction: jest.fn() }));
const { runPrediction } = require('../runPrediction');

function TestHarness({ refreshToken, onRender }) {
  const prediction = usePrediction(refreshToken);
  onRender(prediction);
  return null;
}

// Regression test for a real race condition found on-device: logging a
// dose (or refocusing the Dashboard tab) bumps refreshToken while an
// older runPrediction() call from a previous bump may still be in
// flight. SQLite/async timing varies in ways a fast, synchronous jest
// run doesn't naturally exercise, so this deliberately controls each
// call's resolution order by hand to simulate the older call finishing
// *after* the newer one — exactly the ordering that silently overwrote a
// correct, fresh IOB/COB result with a stale one on-device.
describe('usePrediction', () => {
  it('keeps the newer result when an older in-flight request resolves after it', async () => {
    let resolveFirst;
    let resolveSecond;
    runPrediction
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

    let latest;
    const onRender = (prediction) => { latest = prediction; };

    let renderer;
    act(() => {
      renderer = create(<TestHarness refreshToken={0} onRender={onRender} />);
    });

    // Bumping refreshToken while the first call is still unresolved fires
    // the second runPrediction() call before the first one has settled —
    // exactly the overlapping-request scenario this guards against.
    act(() => {
      renderer.update(<TestHarness refreshToken={1} onRender={onRender} />);
    });

    // Resolve the newer (second) request first, then the older (first,
    // now-stale) one — the older one finishing last must not win.
    await act(async () => {
      resolveSecond({ status: 'ok', iob: 2.5, mealCOB: 0, cobPending: false });
    });
    await act(async () => {
      resolveFirst({ status: 'ok', iob: 0, mealCOB: 0, cobPending: false });
    });

    expect(latest.result.iob).toBe(2.5);
    expect(runPrediction).toHaveBeenCalledTimes(2);
  });
});
