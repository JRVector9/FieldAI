export function loadContract(product: 'agent' | 'field'): Record<string, unknown>;
export function normalizeRoute(path: string): string;
export function successResponseKeys(product: 'agent' | 'field'): string[];
export function assertCoverage(records: Array<{ verified: string[]; failures?: string[] }>,
  products?: Array<'agent' | 'field'>): number;
export function sourceRoutes(product: 'agent' | 'field'): Array<{ method: string; path: string }>;
export function assertSourceRoutes(product: 'agent' | 'field', app?: unknown): void;
export type ContractVerifier = { assertResponse(path: string, method: string, status: number,
  value: unknown, options?: { contentType?: string; headers?: Record<string, unknown> }): void };
export function createContractVerifier(product: 'agent' | 'field'): ContractVerifier;
export function observeContractResponses(app: unknown, product: 'agent' | 'field'): ContractVerifier;
