import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { installationChoices } from '../src/field-ap-public-installation.js';

test('Field installation choices consume only the current organization and explicitly granted installation scopes',()=>{
  const org=randomUUID(),other=randomUUID();
  const own={id:randomUUID(),organizationId:org,apAgentName:'Own selected AI',apOrganizationId:randomUUID(),apAgentId:randomUUID(),
    scopes:['ap.connections.create','ap.deployments.manage'],status:'pending_field_consent'};
  const foreign={...own,id:randomUUID(),organizationId:other,apAgentName:'Other organization AI'};
  const denied={...own,id:randomUUID(),scopes:['ap.agent.read']},revoked={...own,id:randomUUID(),status:'revoked'};
  assert.deepEqual(installationChoices([foreign,own,denied,revoked],org).map(item=>item.id),[own.id]);
  assert.deepEqual(installationChoices([foreign,own,denied,revoked],other).map(item=>item.id),[foreign.id]);
});
