alter table ap.campaigns drop constraint campaigns_draft_knowledge_release_id_fkey;
alter table ap.campaigns add constraint campaigns_draft_knowledge_release_id_fkey
  foreign key (draft_knowledge_release_id) references ap.knowledge_releases(id)
  deferrable initially deferred;

alter table ap.campaign_releases drop constraint campaign_releases_knowledge_release_id_fkey;
alter table ap.campaign_releases add constraint campaign_releases_knowledge_release_id_fkey
  foreign key (knowledge_release_id) references ap.knowledge_releases(id)
  deferrable initially deferred;
