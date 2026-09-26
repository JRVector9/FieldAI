export type SupportAccess = { id: string; inquiryId: string; organizationId: string; requestedBy: string;
  purpose: string; reference: string; reason: string; scopes: string[]; minutes: number;
  approvedBy: string | null; expiresAt: string | null; revokedAt: string | null; state: string; createdAt: string };
export type SupportDetail = { inquiry: { id: string; state: string; mode: string; revision: number };
  scopes: string[]; accessExpiresAt: string;
  messages?: { id: string; sequence: string; actor: string; body: string; createdAt: string }[];
  contact?: { customerName: string | null; customerPhone: string | null; consentAt: string | null; numberOwnership: string };
  attachments?: { id: string; contentType: string; byteSize: number; width: number; height: number }[] };
export type SupportAudit = { id: string; accessId: string; inquiryId: string; actorUserId: string;
  action: string; reason: string; scopes: string[]; attachmentId: string | null; createdAt: string };
export const SUPPORT_SCOPES: Record<string, string> = { conversation: '고객 공개 대화', contact: '고객 이름·연락처', photos: '문의 사진' };
export const SUPPORT_PURPOSES: Record<string, string> = {
  customer_requested_investigation: '고객 요청에 따른 장애 조사', report_investigation: '신고 사실 확인', security_incident: '보안 사고 대응',
};
export const SUPPORT_STATES: Record<string, string> = { pending: '승인 대기', approved: '승인됨', revoked: '회수됨', expired: '만료됨' };
export const SUPPORT_ACTIONS: Record<string, string> = {
  requested: '열람 신청', approved: '열람 승인', revoked: '승인 회수', detail_read: '고객정보 열람',
  photo_read: '사진 열람', photo_unavailable: '사진 조회 실패', read_denied: '읽기 중 권한 종료',
};
export async function supportRequest<T>(path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) {
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() as T & { error?: string } };
}
