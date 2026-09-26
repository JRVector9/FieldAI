export type ModerationReport = { id: string; revision: number; state: string; category: string;
  businessName?: string; publicId?: string; outcome: string | null; reviewSummary: string; appealDecision: string | null;
  appealMessage?: string | null; deploymentRestricted: boolean; createdAt: string };
export type ModerationAccess = { id: string; reportId: string; requestedBy: string; reason: string;
  minutes: number; approvedBy: string | null; expiresAt: string | null };
export type ModerationDetail = ModerationReport & { description: string; accessExpiresAt: string;
  publicSnapshot: { deployment: { publicId: string; kind: string; origin: string | null };
    knowledge: { businessName: string; introduction: string; region: string; openingHours: string;
      services: { name: string; description: string }[]; faqs: { question: string; answer: string }[] };
    agent: { name: string; handoffText: string } };
  events: { action: string; reason: string; actorUserId: string | null; createdAt: string }[] };
export const MODERATION_STATES: Record<string, string> = {
  submitted: '검토 대기', reviewed: '검토 완료', appealed: '이의 검토 중', closed: '처리 종료',
};
export const MODERATION_CATEGORIES: Record<string, string> = {
  inaccurate_information: '사업 안내 정보 확인', unsafe_content: '유해하거나 부적절한 내용', other: '기타',
};
export async function moderationRequest<T>(path: string, method = 'GET', body?: unknown, headers?: Record<string, string>) {
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() as T & { error?: string } };
}

