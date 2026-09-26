alter table ap.agent_releases add column draft_revision integer;
update ap.agent_releases set draft_revision = revision;
alter table ap.agent_releases alter column draft_revision set not null;
alter table ap.agent_releases add constraint agent_releases_draft_revision_check check (draft_revision > 0);
