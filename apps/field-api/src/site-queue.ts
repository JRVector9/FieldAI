import { Valkey } from 'iovalkey';

const enqueueScript = `
if redis.call('SET', KEYS[2], '1', 'NX', 'EX', 30) then
  return redis.call('LPUSH', KEYS[1], ARGV[1])
end
return 0
`;

export class FieldSiteQueue {
  private readonly client: Valkey;
  private readonly readyKey: string;
  private readonly namespace: string;
  private connecting: Promise<void> | null = null;

  constructor(url: string, namespace = 'field:site-generation') {
    if (!/^valkeys?:\/\//.test(url)) throw new Error('FIELD_VALKEY_URL must use valkey:// or valkeys://');
    this.namespace = namespace;
    this.readyKey = `${namespace}:ready`;
    this.client = new Valkey(url, {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1,
      retryStrategy: () => null, connectTimeout: 1000,
    });
    this.client.on('error', () => undefined);
  }

  private async connect() {
    if (this.client.status === 'ready') return;
    if (!this.connecting) this.connecting = this.client.connect().then(
      () => { this.connecting = null; },
      error => { this.connecting = null; throw error; },
    );
    await this.connecting;
  }

  async enqueue(id: string): Promise<void> {
    await this.connect();
    await this.client.eval(enqueueScript, 2, this.readyKey, `${this.namespace}:seen:${id}`, id);
  }

  async dequeue(timeoutSeconds = 1): Promise<string | null> {
    await this.connect();
    const item = await this.client.brpop(this.readyKey, timeoutSeconds);
    if (!item) return null;
    const id = item[1];
    await this.client.del(`${this.namespace}:seen:${id}`);
    return id;
  }

  close() { this.client.disconnect(); }
}
