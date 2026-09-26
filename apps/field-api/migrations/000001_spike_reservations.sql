-- Up Migration
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA spike;

CREATE TABLE spike.resources (
  id text PRIMARY KEY
);

CREATE TABLE spike.reservations (
  id text PRIMARY KEY,
  resource_id text NOT NULL REFERENCES spike.resources(id),
  state text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'confirmed')),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  before_minutes integer NOT NULL DEFAULT 0 CHECK (before_minutes >= 0),
  after_minutes integer NOT NULL DEFAULT 0 CHECK (after_minutes >= 0),
  CHECK (end_at > start_at)
);

CREATE TABLE spike.occupancies (
  reservation_id text PRIMARY KEY REFERENCES spike.reservations(id),
  resource_id text NOT NULL REFERENCES spike.resources(id),
  period tstzrange NOT NULL,
  CONSTRAINT no_overlapping_occupancies EXCLUDE USING gist
    (resource_id WITH =, period WITH &&)
);

CREATE TABLE spike.outbox (
  event_id text PRIMARY KEY,
  reservation_id text NOT NULL REFERENCES spike.reservations(id),
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP SCHEMA spike CASCADE;
