update "oauthResource"
set "allowedScopes" = coalesce("allowedScopes", '[]'::jsonb) || '["ap.sources.refresh"]'::jsonb,
    "updatedAt" = now()
where "identifier" ~ '^https?://[^/]+/integrations/v1$'
  and coalesce("allowedScopes", '[]'::jsonb) ? 'ap.agent.read'
  and not coalesce("allowedScopes", '[]'::jsonb) ? 'ap.sources.refresh';
