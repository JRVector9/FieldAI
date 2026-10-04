// Every queue gets one turn; a continuously populated outbox cannot starve
// the inbox. A failing provider also cannot skip the remaining local queues.
export async function runFieldEventCycle(steps: (() => Promise<string>)[], stopping: () => boolean,
  onError: (error: unknown) => void) {
  let processed = false;
  for (const step of steps) {
    if (stopping()) break;
    try { if (await step() !== 'empty') processed = true; }
    catch (error) { onError(error); }
  }
  return processed;
}
