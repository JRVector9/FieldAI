alter table ap.deployments drop constraint deployments_kind_check;
alter table ap.deployments add constraint deployments_kind_check check (kind in ('link', 'owned_embed', 'placement_embed'));
alter table ap.deployments drop constraint deployments_check;
alter table ap.deployments add column placement_id uuid unique references ap.placements(id) on delete cascade;
alter table ap.deployments add constraint deployments_shape_check check (
  (kind = 'link' and allowed_origin is null and verification_proof is null and placement_id is null)
  or (kind = 'owned_embed' and allowed_origin is not null and verification_proof is not null and placement_id is null)
  or (kind = 'placement_embed' and allowed_origin is not null and verification_proof is null and placement_id is not null)
);

alter table ap.inquiries add column placement_id uuid references ap.placements(id) on delete set null;
create index inquiries_placement_idx on ap.inquiries(placement_id, created_at) where placement_id is not null;
