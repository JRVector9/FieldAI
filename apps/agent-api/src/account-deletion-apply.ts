import type { PoolClient } from 'pg';
import type { AccountDeletionEntry, AgentAccountDeletionJournal } from './account-deletion-journal.js';
import { UNRECONCILABLE_ACTION_SQL } from './work-retention.js';
const DELETED_TEXT = '[삭제됨]';

export async function applyAccountDeletion(db: PoolClient, entry: AccountDeletionEntry, journal: AgentAccountDeletionJournal) {
  const user = (await db.query<{ email: string }>('select email from "user" where id=$1 for update', [entry.targetId])).rows[0];
  if (!user) return null;
  if (user.email !== entry.anonymousEmail && journal.emailFingerprint(user.email) !== entry.sourceEmailHmac)
    throw new Error('account_deletion_restore_binding_conflict');
  const clientIds = (await db.query<{clientId:string}>('select "clientId" from "oauthClient" where "userId"=$1 order by "clientId" for update',[entry.targetId])).rows.map(row=>row.clientId);
  await db.query('update "oauthClient" set disabled=true where "clientId"=any($1::text[])',[clientIds]);
  const removed = {
    memberships: (await db.query('delete from ap.memberships where user_id=$1',[entry.targetId])).rowCount ?? 0,
    administratorMemberships: (await db.query('delete from ap.platform_admin_memberships where user_id=$1',[entry.targetId])).rowCount ?? 0,
    publisherMemberships: (await db.query('delete from ap.publisher_memberships where user_id=$1',[entry.targetId])).rowCount ?? 0,
    sessions: (await db.query('update "session" set "expiresAt"=least("expiresAt",now(),$2),"updatedAt"=now(),"twoFactorVerified"=false where "userId"=$1',[entry.targetId,new Date(entry.createdAt)])).rowCount ?? 0,
    twoFactor: (await db.query('delete from "twoFactor" where "userId"=$1',[entry.targetId])).rowCount ?? 0,
    verifications: (await db.query('delete from "verification" where value=$1',[entry.targetId])).rowCount ?? 0,
    credentials: (await db.query('delete from "account" where "userId"=$1',[entry.targetId])).rowCount ?? 0,
    emailOutboxAnonymized: (await db.query('update ap.email_outbox set "to"=$2 where lower("to")=lower($1)',[user.email,entry.anonymousEmail])).rowCount ?? 0,
  };
  await db.query('update "oauthAccessToken" set revoked=coalesce(revoked,$2) where "userId"=$1 or "clientId"=any($3::text[])',[entry.targetId,new Date(entry.createdAt),clientIds]);
  await db.query('update "oauthRefreshToken" set revoked=coalesce(revoked,$2),"rotationReplayResponse"=null,"rotationReplayExpiresAt"=null where "userId"=$1 or "clientId"=any($3::text[])',[entry.targetId,new Date(entry.createdAt),clientIds]);
  await db.query('delete from "oauthConsent" where "userId"=$1 or "clientId"=any($2::text[])',[entry.targetId,clientIds]);
  await db.query('update ap.oauth_selections set revoked_at=coalesce(revoked_at,$2) where actor_user_id=$1 or client_id=any($3::text[])',[entry.targetId,new Date(entry.createdAt),clientIds]);
  await db.query(`update "user" set name='삭제된 사용자',email=$2,"emailVerified"=false,image=null,
    "twoFactorEnabled"=false,"updatedAt"=now() where id=$1`,[entry.targetId,entry.anonymousEmail]);
  return removed;
}

export async function applyOrganizationDeletionCleanup(db: PoolClient, organizationId: string, at: Date,
  members: string[], integratorSelectionsRevoked = 0) {
  const count = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rowCount ?? 0;
  // Offline replay closes only local access. It never emits remote revocations,
  // revives a delivery worker, charges a card, or sends an owner/customer message.
  await db.query('update ap.oauth_selections set revoked_at=coalesce(revoked_at,$2) where organization_id=$1',[organizationId,at]);
  for(const table of ['oauthAccessToken','oauthRefreshToken']) await db.query(`update "${table}" set revoked=coalesce(revoked,$2) where "referenceId" in(select id::text from ap.oauth_selections where organization_id=$1)`,[organizationId,at]);
  await db.query('delete from "oauthConsent" where "referenceId" in(select id::text from ap.oauth_selections where organization_id=$1)',[organizationId]);
  await db.query(`update ap.field_connections set status='revoked',access_token_cipher=null,refresh_token_cipher=null,updated_at=now() where ap_organization_id=$1`,[organizationId]);
  await db.query("update ap.knowledge_sources set state='revoked',updated_at=now() where organization_id=$1",[organizationId]);
  await db.query(`update ap.field_remote_revocations set state='blocked',lease_until=null,last_error='restore_remote_reconciliation_required',updated_at=now()
    where connection_id in(select id from ap.field_connections where ap_organization_id=$1) and state<>'acked'`,[organizationId]);
    const unresolvableActionRequestsSkipped = (await db.query<{ count: number }>(`select count(*)::int as count from ap.field_action_requests r
      where r.organization_id=$1 and ${UNRECONCILABLE_ACTION_SQL}`, [organizationId])).rows[0]!.count;
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
      sessionsRevoked: await count(`update "session" s set "expiresAt"=now(),"updatedAt"=now(),"twoFactorVerified"=false where s."userId"=any($1::text[])
        and s."expiresAt">now() and not exists(select 1 from ap.memberships m where m.user_id=s."userId" and m.organization_id<>$2)`,
      [members, organizationId]),
      membershipsRemoved: await count('delete from ap.memberships where organization_id=$1', [organizationId]),
      integratorSelectionsRevoked,
      // 연결 해제·동의 24시간 경과로 다시 확인할 수 없어 전제 조건에서 뺀 결과 미상 전달 건수(원본은 보존 정책이 정리)
      unresolvableActionRequestsSkipped,
      retained: ['inquiries_and_consultations_under_retention_policy', 'billing_ledger', 'audit_logs', 'business_name'],
    };
    return executed;
}
