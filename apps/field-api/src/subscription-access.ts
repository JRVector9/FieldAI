import type { Pool, PoolClient } from 'pg';
import { periodAt } from './billing-period.js';

export async function subscriptionAccess(db:Pool|PoolClient,organizationId:string,at?:Date) {
  const clock=(await db.query<{now:Date}>('select coalesce($1::timestamptz,now()) as now',[at??null])).rows[0]!.now;
  // 조직 삭제 예약·완료 뒤에는 새 업무를 막는다. 기존 업무 열람·처리·내보내기는 cleanup_only 규칙대로 유지한다.
  // 이전 스키마를 재현하는 마이그레이션 검사(count 지정)에서는 표가 아직 없으므로 존재를 먼저 확인한다(트랜잭션 중단 방지).
  const deletionTable=(await db.query<{present:boolean}>("select to_regclass('field.organization_deletion_requests') is not null as present")).rows[0]!.present;
  if(deletionTable&&(await db.query("select 1 from field.organization_deletion_requests where organization_id=$1 and status in ('scheduled','executed') limit 1",[organizationId])).rowCount)
    return {mode:'cleanup_only' as const,canStartNew:false,endsAt:null,graceEndsAt:null,reason:'deletion_scheduled'};
  const mode=['mock','sandbox'].includes(process.env.FIELD_PROFILE??'')?'test':'live';
  const paid=(await db.query(`select p.id,p.subscription_id,p.billing_period,p.starts_at,p.ends_at,
    s.anchor_at,s.cancel_requested_at,s.terminated_at,c.grace_days
    from field.billing_periods p join field.paid_subscriptions s on s.id=p.subscription_id
    join field.billing_consents c on c.subscription_id=s.id join field.billing_plans plan on plan.id=s.plan_id
    where s.organization_id=$1 and plan.mode=$3 and p.state='paid' and p.paid_at is not null and p.refunded_amount<p.total_amount
    and p.starts_at<=$2 order by p.ends_at desc,p.id desc limit 1`,[organizationId,clock,mode])).rows[0];
  if(paid&&paid.ends_at.getTime()>clock.getTime())return {mode:'paid' as const,canStartNew:true,subscriptionId:paid.subscription_id,periodId:paid.id,endsAt:paid.ends_at,graceEndsAt:null};
  if(paid&&!paid.cancel_requested_at&&!paid.terminated_at&&paid.anchor_at&&paid.billing_period<1200) {
    const next=periodAt(paid.anchor_at,paid.billing_period+1);
    const grace=new Date(Math.min(next.endsAt.getTime(),next.startsAt.getTime()+paid.grace_days*86400000));
    const laterPaid=(await db.query('select 1 from field.billing_periods where subscription_id=$1 and billing_period>$2 and paid_at is not null limit 1',[paid.subscription_id,paid.billing_period])).rowCount;
    if(!laterPaid&&clock.getTime()<grace.getTime())return {mode:'grace' as const,canStartNew:true,subscriptionId:paid.subscription_id,periodId:null,endsAt:null,graceEndsAt:grace};
  }
  const trial=(await db.query('select ends_at from field.trial_subscriptions where organization_id=$1',[organizationId])).rows[0];
  const mock=process.env.FIELD_PROFILE==='mock';
  // 체험 행은 프로필과 무관하게 행 자체의 ends_at으로 판단한다(행은 승인된 정책으로만 생성된다).
  if(trial&&trial.ends_at.getTime()>clock.getTime())return {mode:'trial' as const,canStartNew:true,endsAt:trial.ends_at,graceEndsAt:null};
  // 카드 없는 mock 체험 미시작의 기존 로컬 동작을 보존한다.
  const history=(await db.query('select 1 from field.paid_subscriptions where organization_id=$1 and anchor_at is not null limit 1',[organizationId])).rowCount;
  if(mock&&!trial&&!paid&&!history)return {mode:'mock_unconfigured' as const,canStartNew:true,endsAt:null,graceEndsAt:null};
  return {mode:'cleanup_only' as const,canStartNew:false,endsAt:paid?.ends_at??null,graceEndsAt:null,
    reason:trial?'trial_ended':'paid_subscription_required'};
}
