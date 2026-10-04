import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { verifyPassword } from 'better-auth/crypto';
import type { FieldBusinessRuntime } from './business.js';
import { disconnectSiteDomain } from './custom-domains.js';
import type { FieldSiteMediaStore } from './site-media.js';
import { recordFieldRevocation, type FieldRevocationJournal } from './revocation-journal.js';
import { accountDeletionJournalFromEnvironment, deletionDatabaseBinding, persistDeletionReceipt } from './account-deletion-journal.js';

// F-O16 조직·계정 삭제(추가). 조직 삭제는 owner 명시 확인 → 14일 유예 → 작업자 실행 순서이며,
// 문의·예약 원본·청구 원장·감사 기록은 지우지 않고 기존 보존 정책 경로에 맡긴다.
export const DELETION_COOLING_DAYS = 14;
const DELETED_TEXT = '[삭제됨]';
// 계정 삭제 비밀번호 재확인: 사용자별 15분 창에 5회까지. 탈취 세션으로 비밀번호를 대입하지 못하게 한다.
const PASSWORD_ATTEMPT_LIMIT = 5;
// 비밀번호가 없는 계정(카카오 전용)은 이 시간 안에 새로 로그인한 세션을 재인증으로 인정한다.
const RECENT_SIGN_IN_MINUTES = 5;
// 실행 실패 재시도 상한. 넘으면 다음 실행 시각을 비워(infinity) 운영자 확인 전까지 멈춘다.
const MAX_EXECUTION_ATTEMPTS = 12;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Db = Pool | PoolClient;
type DeletionRow = { id: string; organization_id: string; requested_by: string; reason: string | null; status: string;
  requested_at: Date; scheduled_at: Date; canceled_at: Date | null; executed_at: Date | null;
  steps: Record<string, unknown>; attempt_count: number; last_error: string | null };

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

// owner·구성원 응답에는 플랫폼 운영자 감사 기록(steps.operatorResumes: 운영자 사용자 ID·사유)을 넣지 않는다.
// 이 기록은 관리자 목록(/v1/admin/organization-deletions)에서만 본다.
function view(row: DeletionRow) {
  const steps = { ...row.steps };
  delete steps.operatorResumes;
  return { id: row.id, status: row.status, reason: row.reason, requestedAt: row.requested_at.toISOString(),
    scheduledAt: row.scheduled_at.toISOString(), canceledAt: row.canceled_at?.toISOString() ?? null,
    executedAt: row.executed_at?.toISOString() ?? null, steps, lastError: row.last_error };
}

// 조직 삭제 전제 조건. ok가 false인 항목이 하나라도 남아 있으면 예약도 실행도 하지 않는다.
export async function organizationDeletionPreconditions(db: Db, organizationId: string) {
  const row = (await db.query<{ paid: number; connections: number; reservations: number; grants: number }>(`select
    (select count(*)::int from field.paid_subscriptions where organization_id=$1 and terminated_at is null) as paid,
    (select count(*)::int from field.ap_connections where organization_id=$1 and status<>'revoked') as connections,
    (select count(*)::int from field.reservations where organization_id=$1
      and state not in ('completed','canceled','rejected','expired','no_show')) as reservations,
    (select count(*)::int from field.oauth_selections where organization_id=$1 and revoked_at is null) as grants`,
  [organizationId])).rows[0]!;
  return [
    ...[
      { code: 'paid_subscription_active', count: row.paid },
      { code: 'connections_active', count: row.connections },
      { code: 'open_reservations', count: row.reservations },
    ].map(item => ({ ...item, ok: item.count === 0 })),
    // M1: 외부·AP 통합자에게 준 선택(grant)은 예약을 막지 않고 실행 때 회수한다. 화면 안내용으로 건수만 알린다.
    { code: 'integration_grants_active', count: row.grants, ok: true, revokedOnExecution: true },
  ];
}

// 계정 삭제 차단 사유. 삭제되지 않은 조직의 owner·플랫폼 관리자·살아 있는 OAuth 연결·본인이 등록한 활성 OAuth client는 먼저 정리해야 한다.
// 비밀번호가 없는 계정은 현재 세션이 최근 로그인(5분 이내)일 때만 재인증된 것으로 본다.
export async function accountDeletionBlockers(db: Db, userId: string, sessionId: string | null) {
  const row = (await db.query<{ owned: boolean; admin: boolean; grants: boolean; clients: boolean; password: boolean; recent: boolean }>(`select
    exists(select 1 from field.organizations where owner_user_id=$1 and deleted_at is null)
      or exists(select 1 from field.memberships m join field.organizations o on o.id=m.organization_id
        where m.user_id=$1 and m.role='owner' and o.deleted_at is null) as owned,
    exists(select 1 from field.platform_admin_memberships where user_id=$1) as admin,
    exists(select 1 from "oauthRefreshToken" where "userId"=$1 and revoked is null and "expiresAt">now()) as grants,
    -- Security #6: 등록자가 익명화되면 관리 주체 없는 client가 계속 토큰을 받으므로, 비활성화·이관 전에는 삭제하지 않는다.
    exists(select 1 from "oauthClient" where "userId"=$1 and coalesce(disabled,false)=false) as clients,
    exists(select 1 from "account" where "userId"=$1 and "providerId"='credential' and password is not null) as password,
    exists(select 1 from "session" where id=$2 and "userId"=$1 and "expiresAt">now()
      and "createdAt">now()-make_interval(mins => $3::int)) as recent`,
  [userId, sessionId, RECENT_SIGN_IN_MINUTES])).rows[0]!;
  const blockers = [row.owned && 'organization_deletion_required', row.admin && 'admin_membership_required_removal',
    row.grants && 'oauth_grants_active', row.clients && 'oauth_clients_active', !row.password && !row.recent && 'reauth_required']
    .filter((code): code is string => typeof code === 'string');
  return { blockers, reauthentication: row.password ? 'password' as const : 'recent_sign_in' as const };
}

// 비밀번호 재확인 시도를 1 소비한다. 호출자 트랜잭션과 별개로 즉시 commit되므로 실패 시도도 창에 남는다.
async function consumePasswordAttempt(pool: Pool, userId: string): Promise<number | null> {
  const row = (await pool.query<{ attempts: number; retry_after: number }>(
    `insert into field.account_deletion_password_windows(user_id, attempts, window_started_at, updated_at)
     values ($1, 1, clock_timestamp(), clock_timestamp())
     on conflict (user_id) do update set
       attempts = case when field.account_deletion_password_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then 1 else least(field.account_deletion_password_windows.attempts + 1, $2::integer + 1) end,
       window_started_at = case when field.account_deletion_password_windows.window_started_at <= clock_timestamp() - interval '15 minutes'
         then clock_timestamp() else field.account_deletion_password_windows.window_started_at end,
       updated_at = clock_timestamp()
     returning attempts,
       greatest(1, ceil(extract(epoch from (window_started_at + interval '15 minutes' - clock_timestamp())))::integer) as retry_after`,
    [userId, PASSWORD_ATTEMPT_LIMIT])).rows[0]!;
  return row.attempts > PASSWORD_ATTEMPT_LIMIT ? row.retry_after : null;
}

type ReauthFailure = { status: 400 | 403 | 429; error: string; retryAfter?: number; recentSignInMinutes?: number };
// 조직 삭제 예약의 본인 재확인(추가, L8). 계정 삭제와 같은 기준이다: 비밀번호 계정은 재입력(시도 창 15분 5회를 계정 삭제와 공유),
// 비밀번호가 없는 카카오 전용 계정은 RECENT_SIGN_IN_MINUTES분 이내 새로 로그인한 현재 세션.
async function reauthenticate(runtime: FieldBusinessRuntime, request: FastifyRequest, userId: string,
  password: unknown): Promise<ReauthFailure | null> {
  const hash = (await runtime.pool.query<{ password: string }>(
    `select password from "account" where "userId"=$1 and "providerId"='credential' and password is not null limit 1`,
    [userId])).rows[0]?.password;
  if (hash) {
    if (typeof password !== 'string' || !password || password.length > 1024) return { status: 400, error: 'password_required' };
    const retryAfter = await consumePasswordAttempt(runtime.pool, userId);
    if (retryAfter !== null) return { status: 429, error: 'password_attempts_exceeded', retryAfter };
    return await verifyPassword({ hash, password }) ? null : { status: 403, error: 'invalid_password' };
  }
  const session = await runtime.resolveSession?.(request.headers);
  const recent = session?.userId === userId && (await runtime.pool.query(
    `select 1 from "session" where id=$1 and "userId"=$2 and "expiresAt">now() and "createdAt">now()-make_interval(mins => $3::int)`,
    [session.id, userId, RECENT_SIGN_IN_MINUTES])).rowCount !== 0;
  return recent ? null : { status: 403, error: 'reauth_required', recentSignInMinutes: RECENT_SIGN_IN_MINUTES };
}

// 사용자가 owner인 조직 전부(삭제 실행된 본인 소유 조직 포함)와 최근 삭제 요청 상태. 여러 조직 owner의 삭제 대상 선택용(추가).
export async function ownedOrganizations(db: Db, userId: string) {
  const rows = (await db.query<{ id: string; name: string; deleted: boolean; status: string | null;
    scheduled_at: Date | null; executed_at: Date | null }>(
    `select o.id,o.name,o.deleted_at is not null as deleted,r.status,r.scheduled_at,r.executed_at from field.organizations o
     left join lateral (select status,scheduled_at,executed_at from field.organization_deletion_requests d
       where d.organization_id=o.id order by d.requested_at desc,d.id desc limit 1) r on true
     where o.owner_user_id=$1 or (o.deleted_at is null and exists(select 1 from field.memberships m
       where m.organization_id=o.id and m.user_id=$1 and m.role='owner'))
     order by o.created_at,o.id`, [userId])).rows;
  return rows.map(row => ({ id: row.id, name: row.name, deleted: row.deleted, deletionStatus: row.status ?? 'none',
    scheduledAt: row.scheduled_at?.toISOString() ?? null, executedAt: row.executed_at?.toISOString() ?? null }));
}

export function registerFieldAccountDeletionRoutes(app: FastifyInstance, runtime: FieldBusinessRuntime) {
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
      `select m.organization_id,m.role,o.name from field.memberships m join field.organizations o on o.id=m.organization_id
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
        `select r.*,o.name from field.organization_deletion_requests r join field.organizations o on o.id=r.organization_id
         where o.owner_user_id=$1 and r.status='executed' and ($2::uuid is null or r.organization_id=$2::uuid)
         order by r.executed_at desc limit 1`, [member.userId, member.selectedId])).rows[0];
      if (!done) return reply.code(404).send({ error: 'organization_not_found' });
      return { product: 'field', organization: { id: done.organization_id, name: done.name, deleted: true }, canManage: false,
        coolingDays: DELETION_COOLING_DAYS, preconditions: [], request: view(done) };
    }
    const latest = (await runtime.pool.query<DeletionRow>(
      'select * from field.organization_deletion_requests where organization_id=$1 order by requested_at desc,id desc limit 1',
      [member.organization.id])).rows[0];
    return { product: 'field', organization: { id: member.organization.id, name: member.organization.name, deleted: false },
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
    // 자유 입력에 NUL이 있으면 PG가 거부해 500이 되므로 먼저 400으로 막는다.
    if (typeof rawReason === 'string' && rawReason.includes('\u0000')) return reply.code(400).send({ error: 'invalid_text' });
    const reason = rawReason === undefined || rawReason === null || rawReason === '' ? null
      : typeof rawReason === 'string' && rawReason.trim().length > 0 && rawReason.trim().length <= 1000 ? rawReason.trim() : undefined;
    if (reason === undefined) return reply.code(400).send({ error: 'invalid_reason' });
    if (ack?.retention !== true || ack.subscriptions !== true || ack.connections !== true)
      return reply.code(400).send({ error: 'acknowledgements_required' });
    if (typeof body?.confirmText !== 'string' || body.confirmText !== member.organization.name)
      return reply.code(400).send({ error: 'confirmation_mismatch' });
    // 조직 삭제 예약도 계정 삭제와 같은 본인 재확인을 거친다(추가, L8).
    const reauth = await reauthenticate(runtime, request, member.userId, body.password);
    if (reauth) {
      const { status, retryAfter, ...failure } = reauth;
      if (retryAfter !== undefined) reply.header('Retry-After', retryAfter);
      return reply.code(status).send(failure);
    }
    const organizationId = member.organization.id;
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const org = (await db.query<{ name: string; deleted_at: Date | null }>(
        'select name,deleted_at from field.organizations where id=$1 for update', [organizationId])).rows[0];
      if (!org || org.deleted_at) { await db.query('rollback'); return reply.code(409).send({ error: 'organization_deleted' }); }
      const open = (await db.query<DeletionRow>(
        "select * from field.organization_deletion_requests where organization_id=$1 and status in ('scheduled','executed')",
        [organizationId])).rows[0];
      if (open) {
        await db.query('rollback');
        return open.status === 'scheduled' ? reply.code(200).send({ request: view(open) })
          : reply.code(409).send({ error: 'organization_deleted' });
      }
      const preconditions = await organizationDeletionPreconditions(db, organizationId);
      const failed = preconditions.find(item => !item.ok);
      if (failed) { await db.query('rollback'); return reply.code(409).send({ error: failed.code, preconditions }); }
      // 공개 사이트는 이 요청 행이 있는 동안 공개 조회에서 숨긴다(sites.ts). 취소하면 다시 보인다.
      const created = (await db.query<DeletionRow>(
        `insert into field.organization_deletion_requests(id,organization_id,requested_by,reason,confirmation,status,
           scheduled_at,next_attempt_at,steps)
         values ($1,$2,$3,$4,$5::jsonb,'scheduled',now()+make_interval(days => $6::int),now()+make_interval(days => $6::int),$7::jsonb)
         returning *`,
        [randomUUID(), organizationId, member.userId, reason,
          JSON.stringify({ organizationName: org.name, acknowledgements: { retention: true, subscriptions: true, connections: true } }),
          DELETION_COOLING_DAYS, JSON.stringify({ scheduled: { siteUnpublished: true } })])).rows[0]!;
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
        "select * from field.organization_deletion_requests where organization_id=$1 and status in ('scheduled','executed') for update",
        [member.organization.id])).rows[0];
      if (!open || open.status !== 'scheduled') {
        await db.query('rollback');
        return open ? reply.code(409).send({ error: 'organization_deleted' }) : reply.code(404).send({ error: 'deletion_request_not_found' });
      }
      // M3: 유예가 끝나 실행이 시작되면(사이트 공개본 삭제·사진 삭제 이관) 되돌릴 수 없으므로 취소하지 않는다.
      if (object(open.steps)?.executionStarted !== undefined) {
        await db.query('rollback'); return reply.code(409).send({ error: 'deletion_in_progress' });
      }
      const canceled = (await db.query<DeletionRow>(
        "update field.organization_deletion_requests set status='canceled',canceled_at=now(),canceled_by=$2 where id=$1 returning *",
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
    const session = await runtime.resolveSession?.(request.headers);
    const { blockers, reauthentication } = await accountDeletionBlockers(runtime.pool, userId,
      session?.userId === userId ? session.id : null);
    return { product: 'field', email: user.email, eligible: blockers.length === 0, blockers, reauthentication,
      recentSignInMinutes: RECENT_SIGN_IN_MINUTES, organizations: await ownedOrganizations(runtime.pool, userId) };
  });

  app.post('/v1/account/deletion-requests', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const userId = await runtime.resolveUserId(request.headers);
    if (!userId) return reply.code(401).send({ error: 'authentication_required' });
    const body = object(request.body);
    if (body?.acknowledgement !== true) return reply.code(400).send({ error: 'acknowledgements_required' });
    const hasPassword = (await runtime.pool.query(
      `select 1 from "account" where "userId"=$1 and "providerId"='credential' and password is not null limit 1`, [userId])).rowCount !== 0;
    let password: string | null = null;
    if (hasPassword) {
      if (typeof body.password !== 'string' || !body.password || body.password.length > 1024)
        return reply.code(400).send({ error: 'password_required' });
      password = body.password;
      const retryAfter = await consumePasswordAttempt(runtime.pool, userId);
      if (retryAfter !== null)
        return reply.header('Retry-After', retryAfter).code(429).send({ error: 'password_attempts_exceeded' });
    }
    const session = await runtime.resolveSession?.(request.headers);
    const db = await runtime.pool.connect();
    try {
      await db.query('begin');
      const user = (await db.query<{ email: string }>('select email from "user" where id=$1 for update', [userId])).rows[0];
      if (!user) { await db.query('rollback'); return reply.code(404).send({ error: 'account_not_found' }); }
      if (typeof body.confirmText !== 'string' || body.confirmText.trim().toLowerCase() !== user.email.toLowerCase()) {
        await db.query('rollback'); return reply.code(400).send({ error: 'confirmation_mismatch' });
      }
      const { blockers } = await accountDeletionBlockers(db, userId, session?.userId === userId ? session.id : null);
      if (blockers.length) {
        await db.query('rollback');
        // L2: 재인증 부족만 남았으면 조직 삭제와 같은 403 reauth_required로 응답한다(reauth_required는 항상 마지막 사유다).
        if (blockers[0] === 'reauth_required')
          return reply.code(403).send({ error: 'reauth_required', recentSignInMinutes: RECENT_SIGN_IN_MINUTES, blockers });
        return reply.code(409).send({ error: blockers[0], blockers });
      }
      // better-auth 기본 비밀번호 검증(ctx.password.verify와 같은 scrypt 구현)으로 재입력을 확인한다.
      // 비밀번호가 없는 계정은 위 차단 검사의 최근 로그인 세션으로 재인증을 갈음한다.
      const hash = (await db.query<{ password: string }>(
        `select password from "account" where "userId"=$1 and "providerId"='credential' and password is not null limit 1`,
        [userId])).rows[0]?.password;
      if (hash ? password === null || !await verifyPassword({ hash, password }) : hasPassword) {
        await db.query('rollback'); return reply.code(403).send({ error: 'invalid_password' });
      }
      const journal=accountDeletionJournalFromEnvironment();if(!journal)throw new Error('deletion journal unavailable');
      const binding=await deletionDatabaseBinding(db),emailFingerprint=journal.emailFingerprint(user.email);
      // A request already waiting on this user lock can outlive a prior fsync
      // intent whose DB transaction rolled back. Reuse its canonical tombstone.
      const approved=(await journal.read(true)).filter(e=>e.targetKind==='account'&&e.targetId===userId);
      if(approved.length>1||approved.some(e=>e.databaseBinding!==binding||e.emailFingerprint!==emailFingerprint))throw new Error('deletion account intent binding mismatch');
      const entry=approved[0]??await journal.append({targetKind:'account',targetId:userId,databaseBinding:binding,
        requestId:null,emailFingerprint,memberIds:[],assets:[]});
      await anonymizeFieldAccount(db,userId,user.email,`deleted-${entry.id}@deleted.invalid`,entry.id);
      await persistDeletionReceipt(db,entry,'applied');
      await db.query('commit');
      return { product: 'field', deleted: true, mode: 'anonymized' };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}

// 유예가 끝난 조직 삭제 요청 하나를 진행한다. 저장소 I/O는 하지 않는다(M3: 잠금을 잡은 채 S3를 기다리지 않는다).
// 1) 사진이 남아 있으면 사이트 공개본·초안을 지우고 남은 사진을 2단계 삭제 경로(state='deleting', site-media.ts
//    runSiteAssetDeletionOnce)로 넘긴 뒤 5분 뒤 다시 확인한다. 이 대기는 실행 실패로 세지 않는다.
//    이때부터 실행 중(steps.executionStarted)이라 owner 취소는 막힌다.
// 2) 사진이 0건이면 통합 grant 회수·사업 정보 비움·구성원 제거 등 나머지 DB 정리를 한 트랜잭션으로 끝낸다.
export async function runOrganizationDeletionOnce(runtime: { pool: Pool; siteMedia?: FieldSiteMediaStore;
  revocationJournal?: Pick<FieldRevocationJournal, 'append'> }): Promise<'empty' | 'executed' | 'blocked' | 'retry'> {
  const db = await runtime.pool.connect();
  let requestId: string | undefined;
  try {
    await db.query('begin');
    const row = (await db.query<DeletionRow>(`select * from field.organization_deletion_requests
      where status='scheduled' and scheduled_at<=clock_timestamp() and next_attempt_at<=clock_timestamp()
      order by next_attempt_at,id for update skip locked limit 1`)).rows[0];
    if (!row) { await db.query('commit'); return 'empty'; }
    requestId = row.id;
    const organizationId = row.organization_id;
    // 사진 업로드(sites.ts)와 같은 조직별 잠금을 조직 행보다 먼저 잡는다(업로드: 이 잠금 → 조직 KEY SHARE와 같은 순서).
    // 사진 수를 센 뒤 commit까지 새 사진 행이 생기지 않는다.
    await db.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`field-site-assets:${organizationId}`]);
    await db.query('select id from field.organizations where id=$1 for update', [organizationId]);
    const failed = new Set((await organizationDeletionPreconditions(db, organizationId)).filter(item => !item.ok).map(item => item.code));
    const assets = (await db.query<{ total: number; stopped: number }>(`select count(*)::int as total,
      count(*) filter (where state='deleting' and deletion_next_attempt_at='infinity'::timestamptz)::int as stopped
      from field.site_assets where organization_id=$1`, [organizationId])).rows[0]!;
    if (assets.total && !runtime.siteMedia) failed.add('blocked_integration');
    // 통합 grant 회수는 복원 뒤 재적용을 위해 회수 원장에 먼저 남긴다. 원장이 없으면 실행하지 않는다.
    const grants = (await db.query('select 1 from field.oauth_selections where organization_id=$1 and revoked_at is null limit 1',
      [organizationId])).rowCount;
    if (grants && !runtime.revocationJournal) failed.add('blocked_integration');
    if (failed.size) {
      await db.query(`update field.organization_deletion_requests set last_error=$2,attempt_count=attempt_count+1,
        next_attempt_at=clock_timestamp()+interval '1 hour' where id=$1`, [row.id, [...failed].join(',')]);
      await db.query('commit'); return 'blocked';
    }
    const journal=accountDeletionJournalFromEnvironment();if(!journal)throw new Error('deletion journal unavailable');
    const entries=await journal.read();
    const entry=entries.find(e=>e.targetKind==='organization'&&e.requestId===row.id)??await journal.append({
      targetKind:'organization',targetId:organizationId,requestId:row.id,emailFingerprint:null,
      databaseBinding:await deletionDatabaseBinding(db),
      memberIds:(await db.query<{user_id:string}>('select user_id from field.memberships where organization_id=$1 order by user_id',[organizationId])).rows.map(r=>r.user_id),
      assets:(await db.query<{id:string;objectKey:string}>('select id,object_key as "objectKey" from field.site_assets where organization_id=$1 order by id',[organizationId])).rows});
    if(entry.databaseBinding!==await deletionDatabaseBinding(db)||entry.targetId!==organizationId)throw new Error('deletion database binding mismatch');
    const count = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rowCount ?? 0;
    const sites = 'select id from field.sites where organization_id=$1';
    const started = object(object(row.steps)?.executionStarted);
    const startedCount = (key: string) => typeof started?.[key] === 'number' ? started[key] as number : 0;
    if (assets.total) {
      // 공개본이 사진을 FK로 참조하므로 공개본·초안을 먼저 지운다(사이트는 예약 때부터 비공개다).
      const releases = await count(`delete from field.site_releases where site_id in (${sites})`, [organizationId]);
      const drafts = await count(`delete from field.site_drafts where site_id in (${sites})`, [organizationId]);
      // 처음 넘길 때는 이미 멈춘 사진 삭제도 다시 시작한다. 그 뒤 다시 멈추면 운영자 재개(/v1/admin/site-asset-deletions)로 푼다.
      const queued = await count(`update field.site_assets set state='deleting',
          deletion_requested_at=coalesce(deletion_requested_at,clock_timestamp()),deletion_next_attempt_at=clock_timestamp(),
          deletion_attempts=0,deletion_error=null,deletion_stopped_at=null
        where organization_id=$1 and (state='ready' or ($2::boolean and deletion_next_attempt_at='infinity'::timestamptz))`,
      [organizationId, !started]);
      const stopped = started ? assets.stopped : 0;
      await db.query(`update field.organization_deletion_requests set attempt_count=attempt_count+1,last_error=$2,
          next_attempt_at=clock_timestamp()+interval '5 minutes',
          steps=steps||jsonb_build_object('executionStarted',jsonb_build_object(
            'at',coalesce(steps->'executionStarted'->'at',to_jsonb(clock_timestamp())),
            'siteReleasesDeleted',$3::int,'siteDraftsDeleted',$4::int,'siteAssetsQueued',$5::int))
        where id=$1`, [row.id, stopped ? 'asset_deletion_stopped' : 'assets_pending', startedCount('siteReleasesDeleted') + releases,
        startedCount('siteDraftsDeleted') + drafts, startedCount('siteAssetsQueued') + queued]);
      await persistDeletionReceipt(db,entry,'prepared');
      await db.query('commit'); return 'blocked';
    }
    await completeFieldOrganizationDeletion(db,row,runtime);
    await persistDeletionReceipt(db,entry,'applied');
    await db.query('commit');
    return 'executed';
  } catch {
    await db.query('rollback');
    if (!requestId) return 'retry';
    // 실행 실패는 상한까지만 재시도한다. 멈춘 요청은 status='scheduled'를 유지해 공개 차단·도메인 차단을 계속하며
    // 운영자가 원인 해결 뒤 다시 실행한다(/v1/admin/organization-deletions/:id/resume).
    // 상한은 전제 조건·사진 삭제 대기(blocked)와 섞이지 않도록 실행 실패 횟수(steps.executionFailures)만 센다.
    const stopped = (await runtime.pool.query<{ stopped: boolean }>(`with failure as (
        select id,coalesce((steps->>'executionFailures')::int,0)+1 as failures from field.organization_deletion_requests
        where id=$1 and status='scheduled')
      update field.organization_deletion_requests r set attempt_count=attempt_count+1,
        steps=steps||jsonb_build_object('executionFailures',f.failures),
        last_error=case when f.failures>=$2 then 'execution_failed,execution_attempts_stopped' else 'execution_failed' end,
        next_attempt_at=case when f.failures>=$2 then 'infinity'::timestamptz else clock_timestamp()+interval '5 minutes' end
      from failure f where r.id=f.id returning r.next_attempt_at='infinity'::timestamptz as stopped`,
    [requestId, MAX_EXECUTION_ATTEMPTS])).rows[0]?.stopped;
    return stopped ? 'blocked' : 'retry';
  } finally { db.release(); }
}

// M1: 조직이 외부·AP 통합자에게 준 선택(grant)을 회수한다. owner 해제 경로(integrator-routes.ts)와 같이 회수 원장에 먼저 남긴 뒤
// 선택·access/refresh 토큰·동의를 같은 트랜잭션에서 지운다. 이미 회수된 선택에 남은 토큰도 함께 회수한다.
async function revokeIntegrationGrants(db: PoolClient, journal: Pick<FieldRevocationJournal, 'append'> | undefined, organizationId: string,signedDeletion=false) {
  const selections = (await db.query<{ id: string; revoked: boolean }>(
    'select id,revoked_at is not null as revoked from field.oauth_selections where organization_id=$1 order by id for update',
    [organizationId])).rows;
  if (!selections.length) return { selections: 0, accessTokens: 0, refreshTokens: 0, consents: 0 };
  for (const selection of selections) if (!selection.revoked&&!signedDeletion) await recordFieldRevocation(journal, { targetKind: 'selection',
    targetId: selection.id, organizationId, selectionId: selection.id, source: 'owner', revocationId: null });
  const ids = selections.map(selection => selection.id);
  const count = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rowCount ?? 0;
  return {
    selections: await count('update field.oauth_selections set revoked_at=now() where organization_id=$1 and revoked_at is null', [organizationId]),
    accessTokens: await count('update "oauthAccessToken" set revoked=now() where "referenceId"=any($1::text[]) and revoked is null', [ids]),
    refreshTokens: await count('update "oauthRefreshToken" set revoked=now() where "referenceId"=any($1::text[]) and revoked is null', [ids]),
    consents: await count('delete from "oauthConsent" where "referenceId"=any($1::text[])', [ids]),
  };
}

async function disconnectDomains(db: PoolClient, organizationId: string) {
  const domains = (await db.query<{ id: string; site_id: string; hostname: string; desired_state: string }>(
    `select id,site_id,hostname,desired_state from field.site_domains where organization_id=$1 and desired_state='active'
     order by id for update`, [organizationId])).rows;
  for (const domain of domains) await disconnectSiteDomain(db, domain);
  return domains.length;
}

export async function anonymizeFieldAccount(db:PoolClient,userId:string,originalEmail:string,anonymousEmail:string,auditId:string) {
      // B9 still blocks deleting an account with active clients/grants online.
      // This also closes expired grants and every actor of a restored owned client.
      await db.query('update "oauthClient" set disabled=true where "userId"=$1',[userId]);
      for(const table of ['oauthAccessToken','oauthRefreshToken'])await db.query(`update "${table}" t set revoked=coalesce(revoked,now())
        where "userId"=$1 or exists(select 1 from "oauthClient" c where c."clientId"=t."clientId" and c."userId"=$1)`,[userId]);
      await db.query('delete from "oauthConsent" t where "userId"=$1 or exists(select 1 from "oauthClient" c where c."clientId"=t."clientId" and c."userId"=$1)',[userId]);
      const removed = {
        memberships: (await db.query('delete from field.memberships where user_id=$1', [userId])).rowCount ?? 0,
        adminMemberships:(await db.query('delete from field.platform_admin_memberships where user_id=$1',[userId])).rowCount??0,
        // 세션은 즉시 만료로 폐기한다(oauth_selections는 세션 삭제에도 남도록 000080에서 set null로 바꿨다).
        sessions: (await db.query('update "session" set "expiresAt"=now(),"updatedAt"=now() where "userId"=$1 and "expiresAt">now()', [userId])).rowCount ?? 0,
        twoFactor: (await db.query('delete from "twoFactor" where "userId"=$1', [userId])).rowCount ?? 0,
        verifications: (await db.query('delete from "verification" where value=$1', [userId])).rowCount ?? 0,
        credentials: (await db.query('delete from "account" where "userId"=$1', [userId])).rowCount ?? 0,
        // 인증 메일 감사 행의 수신 주소를 익명 주소로 바꾸고, 본문에 주소가 있으면 본문도 지운다.
        emailOutboxAnonymized: (await db.query(`update field.email_outbox set "to"=$2,
          text=case when strpos(lower(text),lower($1))>0 then $3 else text end,
          html=case when html is not null and strpos(lower(html),lower($1))>0 then $3 else html end
          where lower("to")=lower($1)`, [originalEmail, anonymousEmail, DELETED_TEXT])).rowCount ?? 0,
        passwordWindows: (await db.query('delete from field.account_deletion_password_windows where user_id=$1', [userId])).rowCount ?? 0,
      };
      // "user" 행은 청구·승인·감사 기록이 FK로 참조하므로 지우지 않고 식별정보를 익명화한다.
      await db.query(`update "user" set name='삭제된 사용자',email=$2,"emailVerified"=false,image=null,
        "twoFactorEnabled"=false,"updatedAt"=now() where id=$1`, [userId, anonymousEmail]);
      await db.query(`insert into field.account_deletion_audit(id,user_id,mode,removed) values ($1,$2,'anonymized',$3::jsonb) on conflict(user_id) do nothing`,
        [auditId, userId, JSON.stringify(removed)]);
  return removed;
}

export async function completeFieldOrganizationDeletion(db:PoolClient,row:Pick<DeletionRow,'id'|'organization_id'|'steps'>,
  runtime:{revocationJournal?:Pick<FieldRevocationJournal,'append'>},restoreMembers?:string[],applyAt?:Date,restoring=false) {
  const organizationId=row.organization_id;
  const count=async(sql:string,params:unknown[])=>(await db.query(sql,params)).rowCount??0;
  const sites='select id from field.sites where organization_id=$1';
  const started=object(object(row.steps)?.executionStarted);
  const startedCount=(key:string)=>typeof started?.[key]==='number'?started[key] as number:0;
    const at = applyAt ?? (await db.query<{ now: Date }>('select clock_timestamp() as now')).rows[0]!.now;
    const members = restoreMembers ?? (await db.query<{ user_id: string }>('select user_id from field.memberships where organization_id=$1',
      [organizationId])).rows.map(member => member.user_id);
    const siteReleasesDeleted = startedCount('siteReleasesDeleted')
      + await count(`delete from field.site_releases where site_id in (${sites})`, [organizationId]);
    const siteDraftsDeleted = startedCount('siteDraftsDeleted')
      + await count(`delete from field.site_drafts where site_id in (${sites})`, [organizationId]);
    const integrationGrantsRevoked = await revokeIntegrationGrants(db, runtime.revocationJournal, organizationId,restoring);
    // 조직을 먼저 삭제됨으로 표시한다(같은 트랜잭션). owner 알림 연락처 정리 guard가 이 표시를 조건으로 쓴다.
    await db.query('update field.organizations set deleted_at=$2 where id=$1 and deleted_at is null', [organizationId, at]);
    const blankCatalog = `jsonb_build_object('businessName',coalesce(content->>'businessName',''),'industry','','introduction','',
      'region','','openingHours','','contactPhone','','defaultBookingMode','request','services','[]'::jsonb,'faqs','[]'::jsonb)`;
    const executed = {
      at: at.toISOString(),
      siteReleasesDeleted,
      siteDraftsDeleted,
      // 사진 행·저장소 객체는 2단계 삭제 경로가 지웠다. 이관한 사진 수를 남긴다.
      siteAssetsDeleted: startedCount('siteAssetsQueued'),
      integrationGrantsRevoked,
      // AI 사용량 원장이 작업 행을 참조하므로 행은 두고 owner 입력 내용만 비운다.
      generationJobsCleared: await count(`update field.site_generation_jobs set prompt=$2,catalog_snapshot='{}'::jsonb,proposal=null,updated_at=now()
        where organization_id=$1`, [organizationId, DELETED_TEXT]),
      // 상호명은 보존 중인 고객 접수 원본의 식별을 위해 남기고, 나머지 owner 입력 사업 정보는 비운다.
      catalogDraftsCleared: await count(`update field.catalog_drafts set content=${blankCatalog},updated_at=now() where organization_id=$1`, [organizationId]),
      catalogReleasesCleared: await count(`update field.catalog_releases set content=${blankCatalog} where organization_id=$1`, [organizationId]),
      ownerRecipientsRevoked: await count("update field.notification_recipients set revoked_at=now() where organization_id=$1 and audience='owner' and revoked_at is null", [organizationId]),
      // owner 알림 연락처 암호문도 지운다(보존 정리와 같은 표시: ciphertext null + retention_purged_at).
      // 발송 기록의 암호문은 미시작·종료 건만 지우고, 결과 미상 등 진행 중 건은 공급사 대조를 위해 남긴다.
      ownerDeliveriesPurged: await count(`update field.notification_deliveries d set recipient_ciphertext=null,retention_purged_at=$2,
        state=case when d.started_at is null then 'suppressed' else d.state end,
        error_code=case when d.started_at is null then 'organization_deleted' else d.error_code end,claim_token=null,lease_expires_at=null
        from field.notification_recipients r where r.id=d.recipient_id and r.organization_id=$1 and r.target_kind='owner'
          and d.retention_purged_at is null and (d.started_at is null or d.state in ('sent','failed','suppressed'))`, [organizationId, at]),
      ownerRecipientsPurged: await count(`update field.notification_recipients set recipient_ciphertext=null,retention_purged_at=$2
        where organization_id=$1 and audience='owner' and recipient_ciphertext is not null`, [organizationId, at]),
      // 자체 도메인은 사업자 연결 해제와 같은 경로로 해제한다. edge 바인딩 제거·claim 해제는 도메인 작업자가 이어서 한다.
      domainsDisconnected: await disconnectDomains(db, organizationId),
      // 다른 조직 구성원 자격이 남은 사용자는 그 조직 작업을 위해 세션을 유지한다. 이 조직 접근은 membership 삭제로 막힌다.
      sessionsRevoked: await count(`update "session" s set "expiresAt"=now(),"updatedAt"=now() where s."userId"=any($1::text[])
        and s."expiresAt">now() and not exists(select 1 from field.memberships m where m.user_id=s."userId" and m.organization_id<>$2)`,
      [members, organizationId]),
      membershipsRemoved: await count('delete from field.memberships where organization_id=$1', [organizationId]),
      retained: ['inquiries_and_reservations_under_retention_policy', 'billing_ledger', 'audit_logs', 'business_name'],
    };
    await db.query(`update field.organization_deletion_requests set status='executed',executed_at=$2,steps=steps||jsonb_build_object('executed',$3::jsonb),
      last_error=null,attempt_count=attempt_count+1 where id=$1`, [row.id, at, JSON.stringify(executed)]);
  return executed;
}
