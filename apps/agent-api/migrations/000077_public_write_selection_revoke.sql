-- AP75 was applied before this additional revoke guard. Preserve applied schema history.
create or replace function ap.public_deployment_revision() returns trigger language plpgsql as $$
begin
  if exists(select 1 from ap.public_installation_deployments where deployment_id=old.id)
    and row(new.id,new.organization_id,new.kind,new.allowed_origin,new.verification_proof,new.created_by,new.created_at)
      is distinct from row(old.id,old.organization_id,old.kind,old.allowed_origin,old.verification_proof,old.created_by,old.created_at) then
    raise exception 'public deployment installation binding is immutable' using errcode='23514';
  end if;
  if new.status='active' and exists(
    select 1 from ap.public_installation_deployments b
      join ap.oauth_selections sel on sel.id=b.selection_id
    where b.deployment_id=old.id and sel.revoked_at is not null) then
    raise exception 'revoked public installation cannot activate' using errcode='23514';
  end if;
  if row(new.status,new.verified_at,new.agent_release_id,new.knowledge_revision,new.moderation_restricted)
    is distinct from row(old.status,old.verified_at,old.agent_release_id,old.knowledge_revision,old.moderation_restricted) then
    new.public_write_revision=old.public_write_revision+1;
  else
    new.public_write_revision=old.public_write_revision;
  end if;
  return new;
end $$;
-- Existing owner/restore revoke updates the selection; only newly bound public installs stop.
create function ap.public_installation_selection_revoke() returns trigger language plpgsql as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    update ap.deployments d set status='paused',updated_at=now()
      from ap.public_installation_deployments b
      where b.deployment_id=d.id and b.selection_id=new.id and d.status<>'paused';
  end if;
  return new;
end $$;
create trigger public_installation_selection_revoke after update of revoked_at on ap.oauth_selections
  for each row execute function ap.public_installation_selection_revoke();

update ap.deployments d set status='paused',updated_at=now()
  from ap.public_installation_deployments b join ap.oauth_selections s on s.id=b.selection_id
  where b.deployment_id=d.id and s.revoked_at is not null and d.status<>'paused';
