// production에서는 AP_PROFILE이 정확히 live여야 한다. 미설정·mock·sandbox·오타는 모두 부팅 거부한다.
export function assertProductionProfile(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === 'production' && env.AP_PROFILE !== 'live')
    throw new Error(`AP_PROFILE must be live in production (got ${JSON.stringify(env.AP_PROFILE ?? null)})`);
}
