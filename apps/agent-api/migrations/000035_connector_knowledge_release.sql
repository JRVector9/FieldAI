alter table ap.knowledge_releases add column draft_revision integer;
update ap.knowledge_releases set draft_revision = revision;
alter table ap.knowledge_releases alter column draft_revision set not null;
alter table ap.knowledge_releases add constraint ap_knowledge_releases_draft_revision_check
  check (draft_revision > 0);

alter table ap.knowledge_releases drop constraint knowledge_releases_source_kind_check;
alter table ap.knowledge_releases add constraint knowledge_releases_source_kind_check
  check (source_kind in ('native', 'connector'));

alter table ap.knowledge_releases
  add column source_id uuid references ap.knowledge_sources(id),
  add column source_revision integer,
  add column source_hash text,
  add column source_selection jsonb;
alter table ap.knowledge_releases add constraint ap_knowledge_releases_connector_source_check
  check ((source_kind = 'native' and source_id is null and source_revision is null
    and source_hash is null and source_selection is null)
    or (source_kind = 'connector' and source_id is not null and source_revision > 0
      and source_hash ~ '^[a-f0-9]{64}$' and source_selection is not null));
create index ap_knowledge_releases_source_idx
  on ap.knowledge_releases(source_id, source_revision, revision desc)
  where source_id is not null;
