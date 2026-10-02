// 종료 신호 처리: 앱을 먼저 닫아 처리 중 요청을 마치고(onClose에서 큐 등 정리), 그 뒤 DB 풀을 닫는다.
// 신호가 반복돼도 한 번만 실행하고, 정리가 실패하거나 멈춰도 제한 시간 안에 반드시 종료한다.
export const SHUTDOWN_TIMEOUT_MS = 10_000;

export function createGracefulShutdown(options: {
  closeApp: () => Promise<unknown>;
  closePools: Array<() => Promise<unknown>>;
  exit?: (code: number) => void;
  onError?: (error: unknown) => void;
  timeoutMs?: number;
}) {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let started = false;
  return async () => {
    if (started) return;
    started = true;
    const timer = setTimeout(() => exit(1), options.timeoutMs ?? SHUTDOWN_TIMEOUT_MS);
    let code = 0;
    try { await options.closeApp(); } catch (error) { code = 1; options.onError?.(error); }
    for (const result of await Promise.allSettled(options.closePools.map((close) => close())))
      if (result.status === 'rejected') { code = 1; options.onError?.(result.reason); }
    clearTimeout(timer);
    exit(code);
  };
}
