export type SupportAccess = { id: string; targetKind: string; targetId: string; organizationId: string; requestedBy: string;
  purpose: string; reference: string; reason: string; scopes: string[]; minutes: number;
  approvedBy: string | null; expiresAt: string | null; revokedAt: string | null; state: string; createdAt: string };
export type SupportDetail = { work: { id: string; kind: string; state: string; bookingMode?: string; source?: string; revision?: number };
  scopes: string[]; accessExpiresAt: string;
  submission?: Record<string, string | null>;
  messages?: { id: string; actor: string; body: string; createdAt: string }[];
  contact?: { customerName: string | null; customerPhone: string | null; consentAt: string | null; visitRegion?: string | null; numberOwnership: string };
  attachments?: { id: string; state: string; contentType: string; byteSize: number | null; width: number | null; height: number | null }[] };
export type SupportAudit = { id: string; accessId: string; targetKind: string; targetId: string; actorUserId: string;
  action: string; reason: string; scopes: string[]; attachmentId: string | null; createdAt: string };
export const SUPPORT_SCOPES: Record<string, string> = { conversation: '고객 공개 대화·제출 내용', contact: '고객 이름·연락처·방문 지역', photos: '업무 사진' };
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

export const SUPPORT_KINDS: Record<string, string> = { inquiry: 'Field 직접 문의', reservation: 'Field 예약', external_request: 'Field가 받은 외부 업무' };
export const SUPPORT_PHOTO_STATES: Record<string, string> = { ready: '저장 완료', copied: '복사 완료', pending: '복사 대기', copying: '복사 중', copy_failed: '복사 실패' };
export const SUPPORT_SUBMISSION_LABELS: Record<string, string> = { requestMessage: '제출 내용', summary: '고객 제출 요약', mode: '제출 방식', preferredTimeText: '희망 시간', requestedStartAt: '요청 시간', confirmedStartAt: '확정 시작', confirmedEndAt: '확정 종료', proposalStartAt: '제안 시작', proposalEndAt: '제안 종료', timezone: '표시 시간대' };
