alter table field.sites add constraint field_sites_id_organization_unique unique(id,organization_id);
create table field.site_domains (
  id uuid primary key,
  organization_id uuid not null references field.organizations(id),
  site_id uuid not null,
  hostname text not null check (hostname=lower(hostname) and char_length(hostname) between 4 and 253 and hostname ~ '^[a-z0-9.-]+$'),
  request_key uuid not null,
  hostname_claimed boolean not null default false,
  created_by text not null references "user"(id),
  ownership_token text not null check (ownership_token ~ '^[A-Za-z0-9_-]{43}$'),
  desired_state text not null default 'active' check (desired_state in ('active','disconnected')),
  state text not null default 'registered' check (state in ('registered','verifying','ownership_pending','dns_pending','tls_pending','connected','blocked_integration','unknown','error','release_pending','disconnected')),
  ownership_state text not null default 'pending' check (ownership_state in ('pending','verified','error')),
  dns_state text not null default 'pending' check (dns_state in ('pending','verified','error')),
  tls_state text not null default 'pending' check (tls_state in ('pending','ready','error','unavailable')),
  binding_state text not null default 'pending' check (binding_state in ('pending','ready','error','unavailable','removed')),
  is_primary boolean not null default false,
  generation integer not null default 1 check(generation>0),
  ownership_release_generation integer check(ownership_release_generation is null or (ownership_release_generation>0 and ownership_release_generation<=generation)),
  claim_token uuid,
  lease_expires_at timestamptz,
  next_check_at timestamptz not null default now(),
  checked_at timestamptz,
  valid_until timestamptz,
  certificate_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(site_id,organization_id) references field.sites(id,organization_id),
  unique(organization_id,request_key),
  unique(organization_id,hostname),
  check ((claim_token is null)=(lease_expires_at is null)),
  check (desired_state='active' or is_primary=false),
  check (state<>'connected' or (ownership_release_generation is null and hostname_claimed and desired_state='active' and ownership_state='verified' and dns_state='verified'
    and tls_state='ready' and binding_state='ready' and valid_until is not null and certificate_expires_at is not null
    and valid_until<=certificate_expires_at))
);
create unique index field_site_domain_claim on field.site_domains(hostname) where hostname_claimed;
create unique index field_site_domain_primary on field.site_domains(site_id) where is_primary;
create index field_site_domain_due on field.site_domains(next_check_at) where state<>'disconnected';
create function field.site_domain_identity_guard() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'domain audit history is retained' using errcode='PFD01'; end if;
  if (new.id,new.organization_id,new.site_id,new.hostname,new.request_key,new.created_by,new.created_at)
    is distinct from (old.id,old.organization_id,old.site_id,old.hostname,old.request_key,old.created_by,old.created_at)
    then raise exception 'domain identity is immutable' using errcode='PFD01'; end if;
  if new.generation<old.generation or (new.ownership_token<>old.ownership_token and new.generation<=old.generation)
    then raise exception 'domain generation cannot regress' using errcode='PFD01'; end if;
  return new;
end $$;
create trigger field_site_domain_identity before update or delete on field.site_domains for each row execute function field.site_domain_identity_guard();
alter table field.site_ap_installations drop constraint site_ap_installations_pkey;
alter table field.site_ap_installations add primary key(site_id,site_origin);
create table field.custom_domain_ap_proofs (
  domain_id uuid primary key references field.site_domains(id),
  site_id uuid not null references field.sites(id),
  proof text not null check(proof ~ '^[A-Za-z0-9_-]{32,64}$'),
  created_by text not null references "user"(id),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
