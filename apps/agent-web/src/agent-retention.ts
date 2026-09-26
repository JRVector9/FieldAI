export type RetentionPolicy = { id: string; anonymousDays: number; workDays: number; photoDays: number; reference: string; reason: string;
  requestedBy: string; approvedBy: string | null; approvedAt: string | null; retiredAt: string | null; state: string };
export type RetentionHold = { id: string; organizationId: string; targetKind: string; targetId: string; reasonCode: string;
  reason: string; reference: string; reviewDueAt: string; createdBy: string; releasedAt: string | null; state: string };
export type RetentionAudit = { id: string; action: string; reason: string; targetId: string | null; createdAt: string };
export type WorkRetention={workPurgedAt:string|null;photosPurgedAt:string|null};
export type RetentionJob={id:string;organizationId:string;targetKind:string;targetId:string;policyId:string;scope:'photos'|'work';revision:number;
 anchorAt:string;requestedBy:string;reason:string;state:string;approvedBy:string|null;attemptCount:number;error:string|null;completedAt:string|null};
export const RETENTION_JOB_STATES:Record<string,string>={pending:'승인 대기',approved:'실행 승인됨',retry:'결과 확인 후 재시도',blocked:'정리 차단',stale:'기준 변경',canceled:'취소됨',completed:'정리 완료'};
export type RetentionPreview = { snapshotAt: string; execution: string; policyId: string; nextCursor: string | null;
  items: { targetKind: string; targetId: string; classification: string; state: string; revision: number; reason: string; closedAt: string | null;
    anchorAt: string | null; workDueAt: string | null; photoDueAt: string | null; workDue: boolean; photosDue: boolean }[] };
export const RETENTION_REASONS: Record<string, string> = { external_work_unresolved: '외부 업무 처리 상태 확인 필요', policy_not_approved: '정책 미승인·중단', active_work: '진행 중 업무',
  unknown_closure: '종결 시각 근거 없음', future_schedule: '미래 예정 업무', active_hold: '분쟁·조사 보류',
  pending_delivery: 'AI 생성·고객 발송 결과 확인 필요', active_support: '지원 열람 진행 중', not_due: '보존 기간 전', due: '정리 기한 도래',
  work_already_purged:'문의 원문 정리 완료',basis_changed:'문의 기준 변경 · 새 미리보기 필요',operator_membership_required:'현재 운영자 권한 확인 필요',
  blocked_integration:'비공개 파일 저장소·독립 증빙 원장 연결 필요',file_or_journal_unconfirmed:'파일 제거·증빙 결과 재확인 필요',
  completion_receipt_pending:'원문 정리 완료 · 독립 증빙 기록 재확인 필요'};
export const RETENTION_ACTIONS: Record<string, string> = { policy_requested: '정책 요청', policy_approved: '정책 승인',
  policy_retired: '정책 중단', hold_created: '보류 등록', hold_released: '보류 해제', preview_read: '미리보기 조회' };
export async function retentionRequest<T>(path: string, method = 'GET', body?: unknown, key?: string) {
  const response = await fetch(path, { method, credentials: 'same-origin',
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(key ? { 'idempotency-key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() as T };
}
