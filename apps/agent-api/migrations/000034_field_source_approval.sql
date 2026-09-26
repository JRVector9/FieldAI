alter table ap.knowledge_sources
  add column approved_by text references "user"(id),
  add column approved_at timestamptz;

alter table ap.knowledge_sources add constraint ap_knowledge_sources_approval_pair
  check ((approved_source_revision is null and approved_by is null and approved_at is null)
    or (approved_source_revision is not null and approved_by is not null and approved_at is not null));
