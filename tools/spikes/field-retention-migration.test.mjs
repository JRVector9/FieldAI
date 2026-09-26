import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import pg from 'pg';

process.loadEnvFile(resolve('infra/field/.env'));
const source = new URL(process.env.FIELD_DATABASE_URL);
assert.equal(source.hostname, '127.0.0.1'); assert.equal(source.port, '55432');
assert.equal(source.username, 'field_local'); assert.equal(source.pathname, '/fieldai_field_mock');

test('Field retention migration derives legacy closure only from the matching current revision ledger and preserves originals', async () => {
  const adminURL = new URL(source); adminURL.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminURL.toString() }); await admin.connect();
  const name = `fieldai_retention_migration_${randomUUID().replaceAll('-', '')}`;
  let created = false, db;
  try {
    await admin.query(`create database "${name}"`); created = true;
    const target = new URL(source); target.pathname = `/${name}`;
    db = new pg.Client({ connectionString: target.toString() }); await db.connect();
    const dir = resolve('apps/field-api/migrations'), files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
    for (const file of files.filter(f => f < '000059_')) await db.query(await readFile(resolve(dir, file), 'utf8'));
    const user = randomUUID(), org = randomUUID(), service = randomUUID();
    await db.query('insert into "user"(id,name,email,"emailVerified") values($1,$2,$3,false)', [user, 'Synthetic migration actor', `${user}@example.invalid`]);
    await db.query('insert into field.organizations(id,owner_user_id,name) values($1,$2,$3)', [org, user, 'Synthetic migration organization']);
    const inquiries = Array.from({ length: 3 }, () => randomUUID());
    for (const id of inquiries) await db.query(`insert into field.inquiries(id,organization_id,catalog_revision,service_id,service_snapshot,
      customer_name,customer_phone,visitor_key_hash,state,revision,consent_at,updated_at)
      values($1,$2,1,$3,'{}','PRIVATE_LEGACY_CUSTOMER','010-3456-7890',$4,'closed',2,now(),now())`, [id, org, service, randomUUID()]);
    const when = '2025-09-01T10:00:00.000Z';
    await db.query(`insert into field.inquiry_resolution_events(id,inquiry_id,event_type,revision,actor_user_id,created_at)
      values($1,$2,'closed',2,$3,$4),($5,$6,'closed',1,$3,$4)`, [randomUUID(), inquiries[0], user, when, randomUUID(), inquiries[1]]);
    const reservation = randomUUID();
    await db.query(`insert into field.reservations(id,organization_id,catalog_revision,service_id,service_snapshot,booking_mode,
      customer_name,customer_phone,visitor_key_hash,timezone,state,revision,consent_at)
      values($1,$2,1,$3,'{}','request','PRIVATE_LEGACY_RESERVATION','010-3456-7891',$4,'Asia/Seoul','completed',2,now())`, [reservation, org, service, randomUUID()]);
    await db.query(`insert into field.reservation_events(id,reservation_id,organization_id,revision,actor_type,actor_user_id,event_type,next_state,occurred_at)
      values($1,$2,$3,2,'owner',$4,'completed','completed',$5)`, [randomUUID(), reservation, org, user, when]);
    const before = (await db.query('select * from field.inquiries order by id')).rows;
    await db.query(await readFile(resolve(dir, '000059_work_retention_basis.sql'), 'utf8'));
    assert.equal((await db.query('select retention_closed_at from field.inquiries where id=$1', [inquiries[0]])).rows[0].retention_closed_at.toISOString(), when);
    for (const id of inquiries.slice(1)) assert.equal((await db.query('select retention_closed_at from field.inquiries where id=$1', [id])).rows[0].retention_closed_at, null);
    assert.equal((await db.query('select retention_closed_at from field.reservations where id=$1', [reservation])).rows[0].retention_closed_at.toISOString(), when);
    const after = (await db.query('select * from field.inquiries order by id')).rows.map(row => { const original = { ...row }; delete original.retention_closed_at; return original; });
    assert.deepEqual(after, before);
    await db.query("update field.inquiries set state='needs_owner' where id=$1", [inquiries[0]]);
    assert.equal((await db.query('select retention_closed_at from field.inquiries where id=$1', [inquiries[0]])).rows[0].retention_closed_at, null);
    await db.query("update field.inquiries set state='closed' where id=$1", [inquiries[0]]);
    const current = (await db.query('select retention_closed_at from field.inquiries where id=$1', [inquiries[0]])).rows[0].retention_closed_at;
    assert.ok(current.getTime() > Date.parse(when));
    const policy = randomUUID();
    await db.query(`insert into field.work_retention_policies(id,work_days,photo_days,reference,reason,requested_by,submission_key_hash,request_hash)
      values($1,180,90,'SYNTHETIC-REVIEW','합성 마이그레이션 정책 검수입니다.',$2,'synthetic-key','synthetic-hash')`, [policy, user]);
    await assert.rejects(db.query('update field.work_retention_policies set work_days=181 where id=$1', [policy]), error => error.code === '23514');
  } finally {
    try { if (db) await db.end(); } finally {
      try { if (created) { await admin.query(`drop database "${name}" with(force)`); console.log('Removed isolated Field retention migration database'); } }
      finally { await admin.end(); }
    }
  }
});
