alter table ap.deployments add column creation_key uuid;
alter table ap.deployments add constraint deployments_creation_unique unique (organization_id, creation_key);
