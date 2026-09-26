create table ap.trial_subscriptions (
  id uuid primary key,
  organization_id uuid not null unique references ap.organizations(id),
  consent_version text not null check (char_length(consent_version) between 1 and 100),
  started_by text not null references "user"(id),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  cancel_requested_at timestamptz,
  cancel_requested_by text references "user"(id),
  check (ends_at > started_at),
  check ((cancel_requested_at is null) = (cancel_requested_by is null))
);
