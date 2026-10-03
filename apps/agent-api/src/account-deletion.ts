import { createHmac, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { verifyPassword } from 'better-auth/crypto';
import type { BusinessRuntime } from './business.js';
import { revokeIntegratorSelection } from './integrator-routes.js';
import { UNRECONCILABLE_ACTION_SQL } from './work-retention.js';

// AP-O09 조직·계정 삭제(추가). 조직 삭제는 owner 명시 확인 → 14일 유예 → 작업자 실행 순서이며,
// 문의·상담 원본·청구 원장·감사 기록은 지우지 않고 기존 보존 정책 경로에 맡긴다.
export const DELETION_COOLING_DAYS = 14;
// 비밀번호가 없는(카카오 전용) 계정은 이 시간 안에 새로 로그인한 세션으로만 계정 삭제를 진행한다.
export const REAUTH_WINDOW_MINUTES = 5;
// 계정 삭제 비밀번호 재입력은 사용자별 15분에 5회까지만 시도할 수 있다.
const PASSWORD_ATTEMPT_LIMIT = 5;
// 실행 실패 재시도 상한(Field와 동일). 넘으면 next_attempt_at을 infinity로 두어 운영자가 다시 실행할 때까지 멈춘다.
const MAX_EXECUTION_ATTEMPTS = 12;
const DELETED_TEXT = '[삭제됨]';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Db = Pool | PoolClient;
type DeletionRow = { id: string; organization_id: string; requested_by: string; reason: string | null; status: string;
  requested_at: Date; scheduled_at: Date; canceled_at: Date | null; executed_at: Date | null;
  steps: Record<string, unknown>; attempt_count: number; last_error: string | null };

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

// 조직 구성원용 보기. 운영자 재실행 기록(steps.operatorResumes)은 운영자 ID·사유를 빼고 시각·직전 오류·실패 횟수만 보인다.
// 전체 기록은 관리자 목록(admin.ts)에서만 보인다.
function view(row: DeletionRow) {
  const resumes = Array.isArray(row.steps.operatorResumes) ? row.steps.operatorResumes : null;
  const steps = resumes ? { ...row.steps, operatorResumes: resumes.map(item => {
    const entry = object(item);
    return { at: entry?.at ?? null, previousError: entry?.previousError ?? null,
      previousExecutionFailures: entry?.previousExecutionFailures ?? null };
  }) } : row.steps;
  return { id: row.id, status: row.status, reason: row.reason, requestedAt: row.requested_at.toISOString(),
    scheduledAt: row.scheduled_at.toISOString(), canceledAt: row.canceled_at?.toISOString() ?? null,
    executedAt: row.executed_at?.toISOString() ?? null, steps, lastError: row.last_error };
}

// 조직이 외부 통합에 내준 살아 있는 권한 선택(동의·refresh token이 있거나 아직 선택 유효 시간 안). 조직 삭제 실행이 회수한다(추가, P2-1).
const OPEN_INTEGRATOR_SELECTION_SQL = `s.organization_id=$1 and s.revoked_at is null and (s.selection_expires_at>clock_timestamp()
  or exists(select 1 from "oauthConsent" oc where oc."referenceId"=s.id::text)
  or exists(select 1 from "oauthRefreshToken" t where t."referenceId"=s.id::text and t.revoked is null))`;

// 조직 삭제 전제 조건. ok=false 항목이 하나라도 남아 있으면 예약도 실행도 하지 않는다.
// integrator_grants_active는 막지 않는 안내 항목이다(실행 때 회수, 회수 저널이 없으면 실행만 보류).
export async function organizationDeletionPreconditions(db: Db, organizationId: string) {
  const row = (await db.query<{ paid: number; connections: number; actions: number; grants: number }>(`select
    (select count(*)::int from ap.paid_subscriptions where organization_id=$1 and terminated_at is null) as paid,
    (select count(*)::int from ap.field_connections where ap_organization_id=$1 and status<>'revoked') as connections,
    (select count(*)::int from ap.field_action_requests r where r.organization_id=$1 and r.state in ('sending','delivery_unknown')
      and not (${UNRECONCILABLE_ACTION_SQL})) as actions,
    (select count(*)::int from ap.oauth_selections s where ${OPEN_INTEGRATOR_SELECTION_SQL}) as grants`,
  [organizationId])).rows[0]!;
  return [
    { code: 'paid_subscription_active', count: row.paid, ok: row.paid === 0 },
    { code: 'connections_active', count: row.connections, ok: row.connections === 0 },
    { code: 'pending_action_requests', count: row.actions, ok: row.actions === 0 },
    { code: 'integrator_grants_active', count: row.grants, ok: true },
  ];
}

// 전제 조건에서 뺀(다시 확인할 수 없는) 결과 미상 전달 건수.
async function unreconcilableActionCount(db: Db, organizationId: string) {
  return (await db.query<{ count: number }>(`select count(*)::int as count from ap.field_action_requests r
    where r.organization_id=$1 and ${UNRECONCILABLE_ACTION_SQL}`, [organizationId])).rows[0]!.count;
}

// 사용자가 owner인 조직 전부(삭제 실행된 본인 소유 조직 포함)와 최근 삭제 요청 상태. 여러 조직 owner의 삭제 대상 선택용(추가).
export async function ownedOrganizations(db: Db, userId: string) {
  const rows = (await db.query<{ id: string; name: string; deleted: boolean; status: string | null;
    scheduled_at: Date | null; executed_at: Date | null }>(
    `select o.id,o.name,o.deleted_at is not null as deleted,r.status,r.scheduled_at,r.executed_at from ap.organizations o
     left join lateral (select status,scheduled_at,executed_at from ap.organization_deletion_requests d
       where d.organization_id=o.id order by d.requested_at desc,d.id desc limit 1) r on true
     where o.owner_user_id=$1 or (o.deleted_at is null and exists(select 1 from ap.memberships m
       where m.organization_id=o.id and m.user_id=$1 and m.role='owner'))
     order by o.created_at,o.id`, [userId])).rows;
  return rows.map(row => ({ id: row.id, name: row.name, deleted: row.deleted, deletionStatus: row.status ?? 'none',
    scheduledAt: row.scheduled_at?.toISOString() ?? null, executedAt: row.executed_at?.toISOString() ?? null }));
}

// 계정 삭제 차단 사유. 삭제되지 않은 조직의 owner·플랫폼 관리자·살아 있는 OAuth 연결은 먼저 정리해야 한다.
// 매체(Distribution) owner·구성원과, 본인이 등록한 활성 OAuth client도 먼저 정리해야 한다(추가, P2-2·보안 #6).
// client는 다른 조직 권한으로 계속 토큰을 발급받을 수 있으므로 정책이 정해질 때까지 막는 쪽을 기본으로 둔다.
export async function accountDeletionBlockers(db: Db, userId: string) {
  const row = (await db.query<{ owned: boolean; admin: boolean; grants: boolean; publisher: boolean; clients: boolean }>(`select
    exists(select 1 from ap.organizations where owner_user_id=$1 and deleted_at is null)
      or exists(select 1 from ap.memberships m join ap.organizations o on o.id=m.organization_id
        where m.user_id=$1 and m.role='owner' and o.deleted_at is null) as owned,
    exists(select 1 from ap.platform_admin_memberships where user_id=$1) as admin,
    exists(select 1 from "oauthRefreshToken" where "userId"=$1 and revoked is null and "expiresAt">now()) as grants,
    exists(select 1 from ap.publishers where owner_user_id=$1)
      or exists(select 1 from ap.publisher_memberships where user_id=$1) as publisher,
    exists(select 1 from "oauthClient" where "userId"=$1 and coalesce(disabled,false)=false) as clients`,
  [userId])).rows[0]!;
  return [row.owned && 'organization_deletion_required', row.admin && 'admin_membership_required_removal',
    row.grants && 'oauth_grants_active', row.publisher && 'publisher_membership_required_removal',
    row.clients && 'oauth_clients_active']
    .filter((code): code is string => typeof code === 'string');
}

// 비밀번호 로그인 정보(credential)의 해시. 없으면 최근 재로그인으로 본인을 확인한다.
async function credentialPasswordHash(db: Db, userId: string) {
  return (await db.query<{ password: string }>(
    `select password from "account" where "userId"=$1 and "providerId"='credential' and password is not null limit 1`,
    [userId])).rows[0]?.password ?? null;
}

// 현재 요청의 세션이 본인 것이고 REAUTH_WINDOW_MINUTES 이내에 새로 만들어졌는지 확인한다(카카오 재로그인 증빙).
async function recentlySignedIn(runtime: BusinessRuntime, db: Db, request: FastifyRequest, userId: string) {
  const session = await runtime.resolveSession?.(request.headers);
  if (!session || session.userId !== userId) return false;
  return Boolean((await db.query(
    `select 1 from "session" where id=$1 and "userId"=$2 and "expiresAt">now()
       and "createdAt">now()-make_interval(mins => $3::int)`, [session.id, userId, REAUTH_WINDOW_MINUTES])).rows[0]);
}

// 비밀번호 시도 창을 1 증가시키고 한도를 넘으면 남은 초를 돌려준다. 호출자 트랜잭션과 별개로 즉시 커밋된다.
async function consumePasswordAttempt(pool: Pool, userId: string): Promise<number | null> {
  const secret = process.env.AP_AUTH_SECRET;
  if (!secret) throw new Error('AP_AUTH_SECRET is required for account deletion attempt limits');
  const subject = createHmac('sha256', secret).update('ap-account-deletion-password-v1\0').update(userId).digest('hex');
  const row = (await pool.query<{ attempts: number; retry_after: number }>(
    `insert into ap.account_deletion_password_windows(subject_hash, attempts, window_started_at, updated_at)
     values ($1, 1, clock_timestamp(), clock_timestamp())
     on conflict (subject_hash) do update set
       attempts = case when ap.account_deletion_password_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then 1 else least(ap.account_deletion_password_windows.attempts + 1, $2::integer + 1) end,
       window_started_at = case when ap.account_deletion_password_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then clock_timestamp() else ap.account_deletion_password_windows.window_started_at end,
       updated_at = clock_timestamp()
     returning attempts,
       greatest(1, ceil(extract(epoch from (window_started_at + interval '15 minutes' - clock_timestamp())))::integer) as retry_after`,
    [subject, PASSWORD_ATTEMPT_LIMIT])).rows[0]!;
  return row.attempts > PASSWORD_ATTEMPT_LIMIT ? row.retry_after : null;
}

type ReauthFailure = { status: 400 | 403 | 429; error: string; retryAfter?: number; reauthWindowMinutes?: number };
// 계정 삭제와 조직 삭제 예약(추가)이 함께 쓰는 본인 재확인. 비밀번호 계정은 재입력(시도 창 15분 5회를 두 경로가 공유),
// 비밀번호가 없는 카카오 전용 계정은 REAUTH_WINDOW_MINUTES분 이내 새로 로그인한 현재 세션으로 확인한다.
async function reauthenticate(runtime: BusinessRuntime, db: Db, request: FastifyRequest, userId: string,
  password: unknown): Promise<ReauthFailure | null> {
  const hash = await credentialPasswordHash(db, userId);
  if (hash) {
    if (typeof password !== 'string') return { status: 400, error: 'password_required' };
    // 실패 시도도 남도록 검증 전에 별도 커밋으로 시도 창을 소비한다(15분 5회).
    const retryAfter = await consumePasswordAttempt(runtime.pool, userId);
    if (retryAfter !== null) return { status: 429, error: 'password_attempts_exceeded', retryAfter };
    // better-auth 기본 비밀번호 검증(ctx.password.verify와 같은 scrypt 구현)으로 재입력을 확인한다.
    return await verifyPassword({ hash, password }) ? null : { status: 403, error: 'invalid_password' };
  }
  // 카카오 전용 계정: 최근 REAUTH_WINDOW_MINUTES분 이내 카카오로 다시 로그인한 세션에서만 진행한다.
  return await recentlySignedIn(runtime, db, request, userId) ? null
    : { status: 403, error: 'reauth_required', reauthWindowMinutes: REAUTH_WINDOW_MINUTES };
}

function sendReauthFailure(reply: FastifyReply, failure: ReauthFailure) {
  const { status, retryAfter, ...body } = failure;
  if (retryAfter !== undefined) reply.header('Retry-After', retryAfter);
  return reply.code(status).send(body);
}

// 재입력 비밀번호 형식: 없거나(카카오 전용 계정) 1~1024자 문자열이어야 한다.
const invalidPasswordField = (password: unknown) =>
  password !== undefined && (typeof password !== 'string' || !password || password.length > 1024);

// 보존 작업자 단계: 15분 창이 끝난 비밀번호 시도 창을 지운다.
export async function purgeAccountDeletionPasswordWindows(pool: Pool) {
  return (await pool.query(
    `delete from ap.account_deletion_password_windows where subject_hash in (select subject_hash
       from ap.account_deletion_password_windows where updated_at < clock_timestamp() - interval '15 minutes'
       order by updated_at limit 1000)`)).rowCount ?? 0;
}

export function registerAgentAccountDeletionRoutes(app: FastifyInstance, runtime: BusinessRuntime) {
  async function memberFor(request: FastifyRequest, reply: FastifyReply) {
    reply.header('Cache-Control', 'private, no-store');
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) { reply.code(401).send({ error: 'authentication_required' }); return null; }
    const header = request.headers['x-organization-id'];
    if (header !== undefined && (typeof header !== 'string' || !uuid.test(header))) {
      reply.code(400).send({ error: 'invalid_organization_id' }); return null;
    }
    // 헤더가 없으면 본인이 owner인 조직을 먼저 고른다(삭제는 owner 조직 기준).
    const row = (await runtime.pool.query<{ organization_id: string; role: string; name: string }>(
      `select m.organization_id,m.role,o.name from ap.memberships m join ap.organizations o on o.id=m.organization_id
       where m.user_id=$1 and o.deleted_at is null and ($2::uuid is null or m.organization_id=$2::uuid)
       order by (m.role='owner') desc,m.created_at limit 1`, [userId, header ?? null])).rows[0];
    return { userId, selectedId: header ?? null,
      organization: row ? { id: row.organization_id, name: row.name, canManage: row.role === 'owner' } : null };
  }

  app.get('/v1/organizations/current/deletion-requests/current', async (request, reply) => {
    const member = await memberFor(request, reply);
    if (!member) return reply;
    if (!member.organization) {
      // 삭제가 끝난 본인 조직은 구성원이 없으므로 owner 기준 실행 기록만 보여 준다.
      const done = (await runtime.pool.query<DeletionRow & { name: string }>(
        `select r.*,o.name from ap.organization_deletion_requests r join ap.organizations o on o.id=r.organization_id
         where o.owner_user_id=$1 and r.status='executed' and ($2::uuid is null or r.organization_id=$2::uuid)
         order by r.executed_at desc limit 1`, [member.userId, member.selectedId])).rows[0];
      if (!done) return reply.code(404).send({ error: 'organization_not_found' });
      return { product: 'agent', organization: { id: done.organization_id, name: done.name, deleted: true }, canManage: false,
        coolingDays: DELETION_COOLING_DAYS, preconditions: [], request: view(done) };
    }
    const latest = (await runtime.pool.query<DeletionRow>(
      'select * from ap.organization_deletion_requests where organization_id=$1 order by requested_at desc,id desc limit 1',
      [member.organization.id])).rows[0];
    return { product: 'agent', organization: { id: member.organization.id, name: member.organization.name, deleted: false },
      canManage: member.organization.canManage, coolingDays: DELETION_COOLING_DAYS,
      preconditions: await organizationDeletionPreconditions(runtime.pool, member.organization.id),
      request: latest ? view(latest) : null };
  });

  app.post('/v1/organizations/current/deletion-requests', async (request, reply) => {
    const member = await memberFor(request, reply);
    if (!member) return reply;
    if (!member.organization) return reply.code(404).send({ error: 'organization_not_found' });
    if (!member.organization.canManage) return reply.code(403).send({ error: 'owner_required' });
    const body = object(request.body);
    const ack = object(body?.acknowledgements);
    const rawReason = body?.reason;
    // NUL 문자는 DB가 거부하므로 저장 전에 400으로 막는다(추가)
    if (typeof rawReason === 'string' && rawReason.includes('\u0000')) return reply.code(400).send({ error: 'invalid_text' });
    const reason = rawReason === undefined || rawReason === null || rawReason === '' ? null
      : typeof rawReason === 'string' && rawReason.trim().length > 0 && rawReason.trim().length <= 1000 ? rawReason.trim() : undefined;
    if (reason === undefined) return reply.code(400).send({ error: 'invalid_reason' });
    if (ack?.retention !== true || ack.subscriptions !== true || ack.connections !== true)
      return reply.code(400).send({ error: 'acknowledgements_required' });
    if (typeof body?.confirmText !== 'string' || body.confirmText !== member.organization.name)
      return reply.code(400).send({ error: 'confirmation_mismatch' });
    // 조직 삭제 예약도 계정 삭제와 같은 본인 재확인을 거친다(추가, L8).
    if (invalidPasswordField(body.password)) return reply.code(400).send({ error: 'password_required' });
    const reauth = await reauthenticate(runtime, runtime.pool, request, member.userId, body.password);
    if (reauth) return sendReauthFailure(reply, reauth);
    const organizationId = member.organization.id;
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const org = (await db.query<{ name: string; deleted_at: Date | null }>(
        'select name,deleted_at from ap.organizations where id=$1 for update', [organizationId])).rows[0];
      if (!org || org.deleted_at) { await db.query('rollback'); return reply.code(409).send({ error: 'organization_deleted' }); }
      const open = (await db.query<DeletionRow>(
        "select * from ap.organization_deletion_requests where organization_id=$1 and status in ('scheduled','executed')",
        [organizationId])).rows[0];
      if (open) {
        await db.query('rollback');
        return open.status === 'scheduled' ? reply.code(200).send({ request: view(open) })
          : reply.code(409).send({ error: 'organization_deleted' });
      }
      const preconditions = await organizationDeletionPreconditions(db, organizationId);
      const failed = preconditions.find(item => !item.ok);
      if (failed) { await db.query('rollback'); return reply.code(409).send({ error: failed.code, preconditions }); }
      // 유예 시작 즉시 공개 상담 배포와 홍보 카드를 멈춘다. 취소해도 자동 재개하지 않는다(owner가 다시 활성화).
      const deployments = (await db.query<{ id: string }>(
        "update ap.deployments set status='paused',updated_at=now() where organization_id=$1 and status='active' returning id",
        [organizationId])).rows.map(row => row.id);
      const campaigns = (await db.query<{ id: string; current_release_id: string | null }>(
        "update ap.campaigns set state='paused',updated_at=now() where organization_id=$1 and state='published' returning id,current_release_id",
        [organizationId])).rows;
      for (const campaign of campaigns)
        await db.query('insert into ap.outbox(id,organization_id,event_type,aggregate_id,payload) values ($1,$2,$3,$4,$5::jsonb)',
          [randomUUID(), organizationId, 'campaign.paused', campaign.id,
            JSON.stringify({ campaignId: campaign.id, releaseId: campaign.current_release_id })]);
      const created = (await db.query<DeletionRow>(
        `insert into ap.organization_deletion_requests(id,organization_id,requested_by,reason,confirmation,status,
           scheduled_at,next_attempt_at,steps)
         values ($1,$2,$3,$4,$5::jsonb,'scheduled',now()+make_interval(days => $6::int),now()+make_interval(days => $6::int),$7::jsonb)
         returning *`,
        [randomUUID(), organizationId, member.userId, reason,
          JSON.stringify({ organizationName: org.name, acknowledgements: { retention: true, subscriptions: true, connections: true } }),
          DELETION_COOLING_DAYS, JSON.stringify({ scheduled: { deploymentsPaused: deployments, campaignsPaused: campaigns.map(row => row.id),
            unresolvableActionRequestsSkipped: await unreconcilableActionCount(db, organizationId) } })])).rows[0]!;
      await db.query('commit');
      return reply.code(201).send({ request: view(created) });
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.delete('/v1/organizations/current/deletion-requests/current', async (request, reply) => {
    const member = await memberFor(request, reply);
    if (!member) return reply;
    if (!member.organization) return reply.code(404).send({ error: 'organization_not_found' });
    if (!member.organization.canManage) return reply.code(403).send({ error: 'owner_required' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const open = (await db.query<DeletionRow>(
        "select * from ap.organization_deletion_requests where organization_id=$1 and status in ('scheduled','executed') for update",
        [member.organization.id])).rows[0];
      if (!open || open.status !== 'scheduled') {
        await db.query('rollback');
        return open ? reply.code(409).send({ error: 'organization_deleted' }) : reply.code(404).send({ error: 'deletion_request_not_found' });
      }
      const canceled = (await db.query<DeletionRow>(
        "update ap.organization_deletion_requests set status='canceled',canceled_at=now(),canceled_by=$2 where id=$1 returning *",
        [open.id, member.userId])).rows[0]!;
      await db.query('commit');
      return { request: view(canceled) };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });

  app.get('/v1/account/deletion-eligibility', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const user = (await runtime.pool.query<{ email: string }>('select email from "user" where id=$1', [userId])).rows[0];
    if (!user) return reply.code(404).send({ error: 'account_not_found' });
    const blockers = await accountDeletionBlockers(runtime.pool, userId);
    // 비밀번호가 없는 계정은 최근 REAUTH_WINDOW_MINUTES분 이내 카카오로 다시 로그인한 세션이어야 한다.
    const verification = await credentialPasswordHash(runtime.pool, userId) ? 'password' : 'recent_sign_in';
    if (verification === 'recent_sign_in' && !await recentlySignedIn(runtime, runtime.pool, request, userId))
      blockers.push('reauth_required');
    return { product: 'agent', email: user.email, eligible: blockers.length === 0, blockers, verification,
      reauthWindowMinutes: REAUTH_WINDOW_MINUTES, organizations: await ownedOrganizations(runtime.pool, userId) };
  });

  app.post('/v1/account/deletion-requests', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const body = object(request.body);
    if (invalidPasswordField(body?.password)) return reply.code(400).send({ error: 'password_required' });
    if (body?.acknowledgement !== true) return reply.code(400).send({ error: 'acknowledgements_required' });
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const user = (await db.query<{ email: string }>('select email from "user" where id=$1 for update', [userId])).rows[0];
      if (!user) { await db.query('rollback'); return reply.code(404).send({ error: 'account_not_found' }); }
      if (typeof body.confirmText !== 'string' || body.confirmText.trim().toLowerCase() !== user.email.toLowerCase()) {
        await db.query('rollback'); return reply.code(400).send({ error: 'confirmation_mismatch' });
      }
      const blockers = await accountDeletionBlockers(db, userId);
      if (blockers.length) { await db.query('rollback'); return reply.code(409).send({ error: blockers[0], blockers }); }
      const reauth = await reauthenticate(runtime, db, request, userId, body.password);
      if (reauth) { await db.query('rollback'); return sendReauthFailure(reply, reauth); }
      const anonymousEmail = `deleted-${randomUUID()}@deleted.invalid`;
      const removed = {
        memberships: (await db.query('delete from ap.memberships where user_id=$1', [userId])).rowCount ?? 0,
        // 세션 행은 지우지 않고 즉시 만료로 폐기한다(oauth_selections는 000087부터 세션 삭제에도 유지).
        sessions: (await db.query('update "session" set "expiresAt"=now(),"updatedAt"=now() where "userId"=$1 and "expiresAt">now()', [userId])).rowCount ?? 0,
        twoFactor: (await db.query('delete from "twoFactor" where "userId"=$1', [userId])).rowCount ?? 0,
        verifications: (await db.query('delete from "verification" where value=$1', [userId])).rowCount ?? 0,
        credentials: (await db.query('delete from "account" where "userId"=$1', [userId])).rowCount ?? 0,
        // 인증 메일 감사 행의 수신 주소도 익명 주소로 바꾼다(발송 결과·시각은 감사용으로 유지).
        emailOutboxAnonymized: (await db.query('update ap.email_outbox set "to"=$2 where lower("to")=lower($1)',
          [user.email, anonymousEmail])).rowCount ?? 0,
      };
      // "user" 행은 청구·승인·감사 기록이 FK로 참조하므로 지우지 않고 식별정보를 익명화한다.
      await db.query(`update "user" set name='삭제된 사용자',email=$2,"emailVerified"=false,image=null,
        "twoFactorEnabled"=false,"updatedAt"=now() where id=$1`, [userId, anonymousEmail]);
      await db.query(`insert into ap.account_deletion_audit(id,user_id,mode,removed) values ($1,$2,'anonymized',$3::jsonb)`,
        [randomUUID(), userId, JSON.stringify(removed)]);
      await db.query('commit');
      return { product: 'agent', deleted: true, mode: 'anonymized' };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}

// 유예가 끝난 조직 삭제 요청 하나를 실행한다. 전체를 한 트랜잭션으로 처리하므로 실패 시 아무것도 반영되지 않고 재시도한다.
export async function runOrganizationDeletionOnce(runtime: { pool: Pool;
  revocationJournal?: BusinessRuntime['revocationJournal'] }): Promise<'empty' | 'executed' | 'blocked' | 'retry'> {
  const db = await runtime.pool.connect();
  let requestId: string | undefined;
  try {
    await db.query('begin');
    const row = (await db.query<DeletionRow>(`select * from ap.organization_deletion_requests
      where status='scheduled' and scheduled_at<=clock_timestamp() and next_attempt_at<=clock_timestamp()
      order by next_attempt_at,id for update skip locked limit 1`)).rows[0];
    if (!row) { await db.query('commit'); return 'empty'; }
    requestId = row.id;
    const organizationId = row.organization_id;
    await db.query('select id from ap.organizations where id=$1 for update', [organizationId]);
    const failed = (await organizationDeletionPreconditions(db, organizationId)).filter(item => !item.ok);
    // 외부 통합 권한 회수는 복원 재적용 저널이 있어야 한다. 저널이 없으면 회수 없이 삭제하지 않고 실행을 보류한다(추가)
    const selections = (await db.query<{ id: string }>(
      `select s.id from ap.oauth_selections s where ${OPEN_INTEGRATOR_SELECTION_SQL} order by s.id for update`,
      [organizationId])).rows.map(selection => selection.id);
    const blockedCodes = [...failed.map(item => item.code),
      ...(selections.length && !runtime.revocationJournal ? ['revocation_journal_unavailable'] : [])];
    if (blockedCodes.length) {
      await db.query(`update ap.organization_deletion_requests set last_error=$2,attempt_count=attempt_count+1,
        next_attempt_at=clock_timestamp()+interval '1 hour' where id=$1`, [row.id, blockedCodes.join(',')]);
      await db.query('commit'); return 'blocked';
    }
    const at = (await db.query<{ now: Date }>('select clock_timestamp() as now')).rows[0]!.now;
    const count = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rowCount ?? 0;
    // 조직이 외부 통합에 내준 권한 선택·토큰·동의를 owner 회수와 같은 규칙으로 닫는다(멤버십 삭제 뒤에는 owner가 회수할 수 없음)
    let integratorSelectionsRevoked = 0;
    for (const selectionId of selections)
      if (await revokeIntegratorSelection(db, runtime.revocationJournal, organizationId, selectionId)) integratorSelectionsRevoked++;
    const unresolvableActionRequestsSkipped = await unreconcilableActionCount(db, organizationId);
    const members = (await db.query<{ user_id: string }>('select user_id from ap.memberships where organization_id=$1',
      [organizationId])).rows.map(member => member.user_id);
    // 조직을 먼저 삭제 표시한다(같은 트랜잭션). owner 수신처 연락처 정리 가드가 deleted_at을 확인한다.
    await db.query('update ap.organizations set deleted_at=$2 where id=$1 and deleted_at is null', [organizationId, at]);
    const executed = {
      at: at.toISOString(),
      deploymentsPaused: await count("update ap.deployments set status='paused',updated_at=now() where organization_id=$1 and status='active'", [organizationId]),
      campaignsPaused: await count("update ap.campaigns set state='paused',updated_at=now() where organization_id=$1 and state='published'", [organizationId]),
      // 상호명은 보존 중인 고객 접수 원본의 식별을 위해 남기고, 나머지 owner 입력 사업 정보는 비운다.
      knowledgeDraftsCleared: await count(`update ap.knowledge_drafts set content=jsonb_build_object('businessName',coalesce(content->>'businessName',''),
        'introduction','','region','','openingHours','','services','[]'::jsonb,'faqs','[]'::jsonb),updated_at=now() where organization_id=$1`, [organizationId]),
      knowledgeReleasesCleared: await count(`update ap.knowledge_releases set content=jsonb_build_object('businessName',coalesce(content->>'businessName',''),
        'introduction','','region','','openingHours','','services','[]'::jsonb,'faqs','[]'::jsonb) where organization_id=$1`, [organizationId]),
      agentDraftsCleared: await count(`update ap.agent_drafts set content=jsonb_build_object('name',$2::text,'tone','clear','guideScope','','handoffText',''),
        updated_at=now() where organization_id=$1`, [organizationId, DELETED_TEXT]),
      agentReleasesCleared: await count(`update ap.agent_releases set content=jsonb_build_object('name',$2::text,'tone','clear','guideScope','','handoffText','')
        where organization_id=$1`, [organizationId, DELETED_TEXT]),
      ownerTestsCleared: await count("update ap.ai_runs set question=$2,answer=null where organization_id=$1 and kind='owner_test'", [organizationId, DELETED_TEXT]),
      sourceSnapshotsDeleted: await count('delete from ap.knowledge_source_snapshots where source_id in (select id from ap.knowledge_sources where organization_id=$1)', [organizationId]),
      sourceConflictsDeleted: await count('delete from ap.knowledge_source_integrity_conflicts where source_id in (select id from ap.knowledge_sources where organization_id=$1)', [organizationId]),
      campaignsCleared: await count('update ap.campaigns set name=$2,updated_at=now() where organization_id=$1', [organizationId, DELETED_TEXT]),
      campaignReleasesCleared: await count(`update ap.campaign_releases set content=content||jsonb_build_object('serviceName',$2::text,'description','')
        where organization_id=$1`, [organizationId, DELETED_TEXT]),
      ownerRecipientsRevoked: await count("update ap.notification_recipients set revoked_at=now() where organization_id=$1 and audience='owner' and revoked_at is null", [organizationId]),
      // owner 발송 기록 암호문(추가, Field와 같은 규칙): 미시작 건은 suppressed로 닫고 지우며, 시작된 건은 sent/failed/suppressed
      // 종료 건만 지운다. 결과 미상 등 진행 중 건은 공급사 대조를 위해 남긴다(000089 guard가 삭제된 조직 owner 건만 허용).
      ownerDeliveriesPurged: await count(`update ap.notification_deliveries d set recipient_ciphertext=null,retention_purged_at=$2,
        state=case when d.started_at is null then 'suppressed' else d.state end,
        error_code=case when d.started_at is null then 'organization_deleted' else d.error_code end,claim_token=null,lease_expires_at=null
        from ap.notification_recipients r where r.id=d.recipient_id and r.organization_id=$1 and r.target_kind='owner'
          and d.retention_purged_at is null and (d.started_at is null or d.state in ('sent','failed','suppressed'))`, [organizationId, at]),
      // 철회만으로는 연락처 암호문이 남으므로 owner 수신처 암호문도 지운다.
      ownerRecipientsCleared: await count(`update ap.notification_recipients set recipient_ciphertext=null,retention_purged_at=now()
        where organization_id=$1 and audience='owner' and retention_purged_at is null`, [organizationId]),
      // 다른 조직 구성원 자격이 남은 사용자는 그 조직 업무를 계속하므로 세션을 유지한다(이 조직 접근은 멤버십 삭제로 차단).
      // 세션 행은 지우지 않고 즉시 만료시킨다.
      sessionsRevoked: await count(`update "session" s set "expiresAt"=now(),"updatedAt"=now() where s."userId"=any($1::text[])
        and s."expiresAt">now() and not exists(select 1 from ap.memberships m where m.user_id=s."userId" and m.organization_id<>$2)`,
      [members, organizationId]),
      membershipsRemoved: await count('delete from ap.memberships where organization_id=$1', [organizationId]),
      integratorSelectionsRevoked,
      // 연결 해제·동의 24시간 경과로 다시 확인할 수 없어 전제 조건에서 뺀 결과 미상 전달 건수(원본은 보존 정책이 정리)
      unresolvableActionRequestsSkipped,
      retained: ['inquiries_and_consultations_under_retention_policy', 'billing_ledger', 'audit_logs', 'business_name'],
    };
    await db.query(`update ap.organization_deletion_requests set status='executed',executed_at=$2,steps=steps||jsonb_build_object('executed',$3::jsonb),
      last_error=null,attempt_count=attempt_count+1 where id=$1`, [row.id, at, JSON.stringify(executed)]);
    await db.query('commit');
    return 'executed';
  } catch (error) {
    await db.query('rollback');
    // 원인 추적용으로 PII가 없는 오류 코드(pg SQLSTATE 또는 오류 이름)만 남긴다. 메시지·detail은 저장하지 않는다.
    const raw = (error as { code?: unknown; name?: unknown } | null);
    const code = typeof raw?.code === 'string' ? raw.code : typeof raw?.name === 'string' ? raw.name : 'unknown';
    const errorCode = /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : 'unknown';
    if (!requestId) return 'retry';
    // 실행 실패는 상한(MAX_EXECUTION_ATTEMPTS)까지만 5분 뒤 재시도하고, 넘으면 infinity로 멈춰 운영자 다시 실행을 기다린다(추가).
    // 상한은 전제 조건 대기(blocked)와 섞이지 않도록 실행 실패 횟수(steps.executionFailures)만 센다.
    const stopped = (await runtime.pool.query<{ stopped: boolean }>(`with failure as (
        select id,coalesce((steps->>'executionFailures')::int,0)+1 as failures from ap.organization_deletion_requests
        where id=$1 and status='scheduled')
      update ap.organization_deletion_requests r set attempt_count=attempt_count+1,
        steps=steps||jsonb_build_object('executionFailures',f.failures),
        last_error=case when f.failures>=$3 then $2::text||',execution_attempts_stopped' else $2::text end,
        next_attempt_at=case when f.failures>=$3 then 'infinity'::timestamptz else clock_timestamp()+interval '5 minutes' end
      from failure f where r.id=f.id returning r.next_attempt_at='infinity'::timestamptz as stopped`,
    [requestId, `execution_failed:${errorCode}`, MAX_EXECUTION_ATTEMPTS])).rows[0]?.stopped;
    return stopped ? 'blocked' : 'retry';
  } finally { db.release(); }
}
