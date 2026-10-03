import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { verifyPassword } from 'better-auth/crypto';
import type { FieldBusinessRuntime } from './business.js';
import { disconnectSiteDomain } from './custom-domains.js';
import { MediaPermissionError, type FieldSiteMediaStore } from './site-media.js';

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

function view(row: DeletionRow) {
  return { id: row.id, status: row.status, reason: row.reason, requestedAt: row.requested_at.toISOString(),
    scheduledAt: row.scheduled_at.toISOString(), canceledAt: row.canceled_at?.toISOString() ?? null,
    executedAt: row.executed_at?.toISOString() ?? null, steps: row.steps, lastError: row.last_error };
}

// 조직 삭제 전제 조건. 하나라도 남아 있으면 예약도 실행도 하지 않는다.
export async function organizationDeletionPreconditions(db: Db, organizationId: string) {
  const row = (await db.query<{ paid: number; connections: number; reservations: number }>(`select
    (select count(*)::int from field.paid_subscriptions where organization_id=$1 and terminated_at is null) as paid,
    (select count(*)::int from field.ap_connections where organization_id=$1 and status<>'revoked') as connections,
    (select count(*)::int from field.reservations where organization_id=$1
      and state not in ('completed','canceled','rejected','expired','no_show')) as reservations`,
  [organizationId])).rows[0]!;
  return [
    { code: 'paid_subscription_active', count: row.paid },
    { code: 'connections_active', count: row.connections },
    { code: 'open_reservations', count: row.reservations },
  ].map(item => ({ ...item, ok: item.count === 0 }));
}

// 계정 삭제 차단 사유. 삭제되지 않은 조직의 owner·플랫폼 관리자·살아 있는 OAuth 연결은 먼저 정리해야 한다.
// 비밀번호가 없는 계정은 현재 세션이 최근 로그인(5분 이내)일 때만 재인증된 것으로 본다.
export async function accountDeletionBlockers(db: Db, userId: string, sessionId: string | null) {
  const row = (await db.query<{ owned: boolean; admin: boolean; grants: boolean; password: boolean; recent: boolean }>(`select
    exists(select 1 from field.organizations where owner_user_id=$1 and deleted_at is null)
      or exists(select 1 from field.memberships m join field.organizations o on o.id=m.organization_id
        where m.user_id=$1 and m.role='owner' and o.deleted_at is null) as owned,
    exists(select 1 from field.platform_admin_memberships where user_id=$1) as admin,
    exists(select 1 from "oauthRefreshToken" where "userId"=$1 and revoked is null and "expiresAt">now()) as grants,
    exists(select 1 from "account" where "userId"=$1 and "providerId"='credential' and password is not null) as password,
    exists(select 1 from "session" where id=$2 and "userId"=$1 and "expiresAt">now()
      and "createdAt">now()-make_interval(mins => $3::int)) as recent`,
  [userId, sessionId, RECENT_SIGN_IN_MINUTES])).rows[0]!;
  const blockers = [row.owned && 'organization_deletion_required', row.admin && 'admin_membership_required_removal',
    row.grants && 'oauth_grants_active', !row.password && !row.recent && 'reauth_required']
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
    return { userId, organization: row ? { id: row.organization_id, name: row.name, canManage: row.role === 'owner' } : null };
  }

  app.get('/v1/organizations/current/deletion-requests/current', async (request, reply) => {
    const member = await memberFor(request, reply);
    if (!member) return reply;
    if (!member.organization) {
      // 삭제가 끝난 본인 조직은 구성원이 없으므로 owner 기준 실행 기록만 보여 준다.
      const done = (await runtime.pool.query<DeletionRow & { name: string }>(
        `select r.*,o.name from field.organization_deletion_requests r join field.organizations o on o.id=r.organization_id
         where o.owner_user_id=$1 and r.status='executed' order by r.executed_at desc limit 1`, [member.userId])).rows[0];
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
    const reason = rawReason === undefined || rawReason === null || rawReason === '' ? null
      : typeof rawReason === 'string' && rawReason.trim().length > 0 && rawReason.trim().length <= 1000 ? rawReason.trim() : undefined;
    if (reason === undefined) return reply.code(400).send({ error: 'invalid_reason' });
    if (ack?.retention !== true || ack.subscriptions !== true || ack.connections !== true)
      return reply.code(400).send({ error: 'acknowledgements_required' });
    if (typeof body?.confirmText !== 'string' || body.confirmText !== member.organization.name)
      return reply.code(400).send({ error: 'confirmation_mismatch' });
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
      recentSignInMinutes: RECENT_SIGN_IN_MINUTES };
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
      if (blockers.length) { await db.query('rollback'); return reply.code(409).send({ error: blockers[0], blockers }); }
      // better-auth 기본 비밀번호 검증(ctx.password.verify와 같은 scrypt 구현)으로 재입력을 확인한다.
      // 비밀번호가 없는 계정은 위 차단 검사의 최근 로그인 세션으로 재인증을 갈음한다.
      const hash = (await db.query<{ password: string }>(
        `select password from "account" where "userId"=$1 and "providerId"='credential' and password is not null limit 1`,
        [userId])).rows[0]?.password;
      if (hash ? password === null || !await verifyPassword({ hash, password }) : hasPassword) {
        await db.query('rollback'); return reply.code(403).send({ error: 'invalid_password' });
      }
      const anonymousEmail = `deleted-${randomUUID()}@deleted.invalid`;
      const removed = {
        memberships: (await db.query('delete from field.memberships where user_id=$1', [userId])).rowCount ?? 0,
        // 세션은 즉시 만료로 폐기한다(oauth_selections는 세션 삭제에도 남도록 000080에서 set null로 바꿨다).
        sessions: (await db.query('update "session" set "expiresAt"=now(),"updatedAt"=now() where "userId"=$1 and "expiresAt">now()', [userId])).rowCount ?? 0,
        twoFactor: (await db.query('delete from "twoFactor" where "userId"=$1', [userId])).rowCount ?? 0,
        verifications: (await db.query('delete from "verification" where value=$1', [userId])).rowCount ?? 0,
        credentials: (await db.query('delete from "account" where "userId"=$1', [userId])).rowCount ?? 0,
        // 인증 메일 감사 행의 수신 주소를 익명 주소로 바꾸고, 본문에 주소가 있으면 본문도 지운다.
        emailOutboxAnonymized: (await db.query(`update field.email_outbox set "to"=$2,
          text=case when strpos(lower(text),lower($1))>0 then $3 else text end,
          html=case when html is not null and strpos(lower(html),lower($1))>0 then $3 else html end
          where lower("to")=lower($1)`, [user.email, anonymousEmail, DELETED_TEXT])).rowCount ?? 0,
        passwordWindows: (await db.query('delete from field.account_deletion_password_windows where user_id=$1', [userId])).rowCount ?? 0,
      };
      // "user" 행은 청구·승인·감사 기록이 FK로 참조하므로 지우지 않고 식별정보를 익명화한다.
      await db.query(`update "user" set name='삭제된 사용자',email=$2,"emailVerified"=false,image=null,
        "twoFactorEnabled"=false,"updatedAt"=now() where id=$1`, [userId, anonymousEmail]);
      await db.query(`insert into field.account_deletion_audit(id,user_id,mode,removed) values ($1,$2,'anonymized',$3::jsonb)`,
        [randomUUID(), userId, JSON.stringify(removed)]);
      await db.query('commit');
      return { product: 'field', deleted: true, mode: 'anonymized' };
    } catch (error) { await db.query('rollback'); throw error; } finally { db.release(); }
  });
}

// 유예가 끝난 조직 삭제 요청 하나를 실행한다. DB 변경은 한 트랜잭션이며, 사이트 사진 파일은 commit 전에 지우고
// 부재를 확인한다. 실패하면 DB는 그대로 두고 재시도하며 파일 삭제는 반복해도 같은 결과다.
export async function runOrganizationDeletionOnce(runtime: { pool: Pool; siteMedia?: FieldSiteMediaStore }): Promise<'empty' | 'executed' | 'blocked' | 'retry'> {
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
    await db.query('select id from field.organizations where id=$1 for update', [organizationId]);
    const failed = (await organizationDeletionPreconditions(db, organizationId)).filter(item => !item.ok).map(item => item.code);
    const assets = (await db.query<{ id: string; object_key: string }>(
      'select id,object_key from field.site_assets where organization_id=$1 order by id for update', [organizationId])).rows;
    if (assets.length && !runtime.siteMedia) failed.push('blocked_integration');
    if (failed.length) {
      await db.query(`update field.organization_deletion_requests set last_error=$2,attempt_count=attempt_count+1,
        next_attempt_at=clock_timestamp()+interval '1 hour' where id=$1`, [row.id, failed.join(',')]);
      await db.query('commit'); return 'blocked';
    }
    const at = (await db.query<{ now: Date }>('select clock_timestamp() as now')).rows[0]!.now;
    const count = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rowCount ?? 0;
    const members = (await db.query<{ user_id: string }>('select user_id from field.memberships where organization_id=$1',
      [organizationId])).rows.map(member => member.user_id);
    const sites = 'select id from field.sites where organization_id=$1';
    const siteReleasesDeleted = await count(`delete from field.site_releases where site_id in (${sites})`, [organizationId]);
    const siteDraftsDeleted = await count(`delete from field.site_drafts where site_id in (${sites})`, [organizationId]);
    for (const asset of assets) {
      await runtime.siteMedia!.delete(asset.object_key);
      const present = runtime.siteMedia!.exists ? await runtime.siteMedia!.exists(asset.object_key)
        : await runtime.siteMedia!.get(asset.object_key) !== null;
      if (present) throw new Error('file_delete_unconfirmed');
    }
    // 조직을 먼저 삭제됨으로 표시한다(같은 트랜잭션). owner 알림 연락처 정리 guard가 이 표시를 조건으로 쓴다.
    await db.query('update field.organizations set deleted_at=$2 where id=$1 and deleted_at is null', [organizationId, at]);
    const blankCatalog = `jsonb_build_object('businessName',coalesce(content->>'businessName',''),'industry','','introduction','',
      'region','','openingHours','','contactPhone','','defaultBookingMode','request','services','[]'::jsonb,'faqs','[]'::jsonb)`;
    const executed = {
      at: at.toISOString(),
      siteReleasesDeleted,
      siteDraftsDeleted,
      siteAssetsDeleted: await count('delete from field.site_assets where organization_id=$1', [organizationId]),
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
    await db.query('commit');
    return 'executed';
  } catch (error) {
    await db.query('rollback');
    if (!requestId) return 'retry';
    // 저장소 권한 부족(media_permission)은 재시도로 풀리지 않으므로 즉시 멈추고, 그 밖의 실패는 상한까지만 재시도한다.
    // 멈춘 요청은 status='scheduled'를 유지해 공개 차단·도메인 차단을 계속하며 운영자가 원인 해결 뒤 next_attempt_at을 되돌린다.
    const code = error instanceof MediaPermissionError ? 'media_permission' : 'execution_failed';
    // 상한은 전제 조건 대기(blocked)와 섞이지 않도록 실행 실패 횟수(steps.executionFailures)만 센다.
    const stopped = (await runtime.pool.query<{ stopped: boolean }>(`with failure as (
        select id,coalesce((steps->>'executionFailures')::int,0)+1 as failures from field.organization_deletion_requests
        where id=$1 and status='scheduled')
      update field.organization_deletion_requests r set attempt_count=attempt_count+1,
        steps=steps||jsonb_build_object('executionFailures',f.failures),
        last_error=case when $2='media_permission' or f.failures>=$3 then $2||',execution_attempts_stopped' else $2 end,
        next_attempt_at=case when $2='media_permission' or f.failures>=$3 then 'infinity'::timestamptz
          else clock_timestamp()+interval '5 minutes' end
      from failure f where r.id=f.id returning r.next_attempt_at='infinity'::timestamptz as stopped`,
    [requestId, code, MAX_EXECUTION_ATTEMPTS])).rows[0]?.stopped;
    return stopped ? 'blocked' : 'retry';
  } finally { db.release(); }
}

async function disconnectDomains(db: PoolClient, organizationId: string) {
  const domains = (await db.query<{ id: string; site_id: string; hostname: string; desired_state: string }>(
    `select id,site_id,hostname,desired_state from field.site_domains where organization_id=$1 and desired_state='active'
     order by id for update`, [organizationId])).rows;
  for (const domain of domains) await disconnectSiteDomain(db, domain);
  return domains.length;
}
