update "oauthResource"
set "allowedScopes" = coalesce("allowedScopes", '[]'::jsonb) || '["offline_access"]'::jsonb,
    "updatedAt" = now()
where "identifier" ~ '^https?://[^/]+/integrations/v1$'
  and not coalesce("allowedScopes", '[]'::jsonb) ? 'offline_access';
