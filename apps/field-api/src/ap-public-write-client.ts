// HTTP-only consumer of contracts/agent-integrator-v1.openapi.json, preview.9.
// Caller BFF owns its OAuth token and persists each UUID before invoking these methods.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v)
  ? v as Record<string, unknown> : null;
export type ApPublicConnection = { id: string; organizationId: string; agentId: string;
  externalOrganizationId: string; origin: string; revision: number; createdAt: string;
  state: 'installation_only'; request_id: string; operation_id: string; retryable: false };
export type ApPublicDeployment = { id: string; publicId: string; connectionId: string; organizationId: string;
  agentId: string; kind: 'owned_embed'; origin: string; verificationProof: string; verifiedAt: string | null;
  knowledgeRevision: number | null; revision: number; createdAt: string; state: 'pending' | 'active' | 'paused';
  request_id: string; operation_id: string; retryable: false };
type Config = { apiOrigin: string; accessToken: string; organizationId: string; agentId: string; fetcher?: typeof fetch;
  mock?: boolean };
export class ApPublicWriteError extends Error {
  constructor(readonly status: number, readonly code: string, readonly retryable: boolean) { super(code); }
}
const validDate = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const invalid = () => new ApPublicWriteError(502, 'invalid_ap_public_write_response', false);
const unknownWrite = () => new ApPublicWriteError(503, 'ap_public_write_result_unknown', true);
function validOrigin(value: string, mock = false, endpoint = false) {
  try {
    const u = new URL(value);
    if (u.origin !== value || u.username || u.password) return false;
    if (u.protocol === 'https:') return endpoint || (!u.port && /^[a-z0-9.-]+$/i.test(u.hostname)
      && u.hostname.includes('.') && !/(^|\.)localhost$/.test(u.hostname));
    if (!mock || u.protocol !== 'http:') return false;
    return endpoint ? ['127.0.0.1', 'localhost'].includes(u.hostname)
      : /^[a-z0-9-]+\.localhost$/.test(u.hostname) && /^\d{4,5}$/.test(u.port) && Number(u.port) <= 65535;
  } catch { return false; }
}
export class ApPublicWriteClient {
  readonly contractVersion = '1.0.0-preview.9';
  constructor(private readonly config: Config) {
    if (!validOrigin(config.apiOrigin, config.mock, true) || !uuid.test(config.organizationId) || !uuid.test(config.agentId)
      || !/^[A-Za-z0-9_-]{20,512}$/.test(config.accessToken)) throw new Error('invalid_ap_public_write_configuration');
  }
  private async call(path: string, body?: object, key?: string, revision?: number) {
    if (body !== undefined && (!key || !uuid.test(key))) throw new Error('invalid_idempotency_key');
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1)) throw new Error('invalid_revision');
    let response: Response;
    try {
      response = await (this.config.fetcher ?? fetch)(`${this.config.apiOrigin}/integrations/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { authorization: `Bearer ${this.config.accessToken}`,
          ...(body !== undefined ? { 'content-type': 'application/json', 'Idempotency-Key': key! } : {}),
          ...(revision === undefined ? {} : { 'If-Match': `"${revision}"` }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { throw new ApPublicWriteError(503, body === undefined ? 'ap_public_write_unavailable' : 'ap_public_write_result_unknown', true); }
    let result: Record<string, unknown> | null;
    try { result = object(await response.json()); }
    catch { throw body === undefined ? invalid() : unknownWrite(); }
    if (!response.ok) {
      const code = typeof result?.error === 'string' && /^[a-z_]{1,100}$/.test(result.error) ? result.error : 'ap_public_write_rejected';
      throw new ApPublicWriteError(response.status, code, result?.retryable === true);
    }
    if (!result || ![200, 201].includes(response.status) || typeof result.request_id !== 'string'
      || !uuid.test(String(result.operation_id)) || result.retryable !== false
      || result.organizationId !== this.config.organizationId || result.agentId !== this.config.agentId
      || !uuid.test(String(result.id)) || !Number.isSafeInteger(result.revision) || Number(result.revision) < 1
      || !validDate(result.createdAt)) throw body === undefined ? invalid() : unknownWrite();
    return result;
  }
  async createConnection(input: { externalOrganizationId: string; origin: string }, key: string): Promise<ApPublicConnection> {
    if (!uuid.test(input.externalOrganizationId) || !validOrigin(input.origin, this.config.mock)) throw new Error('invalid_public_connection');
    const result = await this.call('/connections', { organizationId: this.config.organizationId,
      agentId: this.config.agentId, externalOrganizationId: input.externalOrganizationId, origin: input.origin }, key);
    if (result.state !== 'installation_only' || result.revision !== 1 || result.origin !== input.origin
      || result.externalOrganizationId !== input.externalOrganizationId) throw unknownWrite();
    return result as ApPublicConnection;
  }
  async getConnection(id: string, expected: { externalOrganizationId: string; origin: string }): Promise<ApPublicConnection> {
    if (!uuid.test(id)) throw new Error('invalid_connection_id');
    const result = await this.call(`/connections/${id}`);
    if (result.id !== id || result.state !== 'installation_only' || result.revision !== 1 || result.origin !== expected.origin
      || result.externalOrganizationId !== expected.externalOrganizationId) throw invalid();
    return result as ApPublicConnection;
  }
  private deployment(result: Record<string, unknown>, expected: { id?: string; connectionId: string; origin: string }, write = false): ApPublicDeployment {
    if ((expected.id !== undefined && result.id !== expected.id) || result.connectionId !== expected.connectionId
      || result.origin !== expected.origin || result.kind !== 'owned_embed' || !['pending', 'active', 'paused'].includes(String(result.state))
      || typeof result.publicId !== 'string' || !/^dep_[A-Za-z0-9_-]{20,50}$/.test(result.publicId)
      || typeof result.verificationProof !== 'string' || !/^[A-Za-z0-9_-]{20,50}$/.test(result.verificationProof)
      || (result.verifiedAt !== null && !validDate(result.verifiedAt))
      || (result.knowledgeRevision !== null && (!Number.isSafeInteger(result.knowledgeRevision) || Number(result.knowledgeRevision) < 1))
      || (result.state === 'active' && (!result.verifiedAt || !result.knowledgeRevision))) throw write ? unknownWrite() : invalid();
    return result as ApPublicDeployment;
  }
  async prepareDeployment(connection: { id: string; origin: string }, key: string): Promise<ApPublicDeployment> {
    if (!uuid.test(connection.id) || !validOrigin(connection.origin, this.config.mock)) throw new Error('invalid_public_deployment');
    const result = await this.call('/deployments', { connectionId: connection.id, organizationId: this.config.organizationId,
      agentId: this.config.agentId, kind: 'owned_embed', origin: connection.origin }, key);
    return this.deployment(result, { connectionId: connection.id, origin: connection.origin }, true);
  }
  async getDeployment(expected: Pick<ApPublicDeployment, 'id' | 'connectionId' | 'origin'>): Promise<ApPublicDeployment> {
    if (!uuid.test(expected.id)) throw new Error('invalid_deployment_id');
    return this.deployment(await this.call(`/deployments/${expected.id}`), expected);
  }
  async updateDeployment(action: 'verify' | 'activate' | 'pause', current: Pick<ApPublicDeployment, 'id' | 'connectionId' | 'origin' | 'revision'>,
    key: string): Promise<ApPublicDeployment> {
    if (!uuid.test(current.id) || !['verify', 'activate', 'pause'].includes(action)) throw new Error('invalid_deployment_operation');
    return this.deployment(await this.call(`/deployments/${current.id}/${action}`, {}, key, current.revision), current, true);
  }
}
