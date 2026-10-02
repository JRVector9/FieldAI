// 운영(NODE_ENV=production)에서는 FIELD_PROFILE이 정확히 live여야 한다(AGENTS §4).
// 누락·mock·sandbox·오타는 모두 부팅 실패로 처리한다.
export function assertProductionProfile(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' && env.FIELD_PROFILE !== 'live')
    throw new Error(`FIELD_PROFILE must be "live" in production (got ${JSON.stringify(env.FIELD_PROFILE ?? null)})`);
}
