alter table ap.publishers add column creation_key uuid;
alter table ap.publishers add constraint publishers_creation_unique unique (owner_user_id, creation_key);
