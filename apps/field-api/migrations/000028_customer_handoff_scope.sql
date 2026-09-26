update "oauthResource"
set "allowedScopes" = coalesce("allowedScopes", '[]'::jsonb) || '["field.customer_access.create"]'::jsonb,
    "updatedAt" = now()
where "identifier" ~ '^https?://[^/]+/integrations/v1$'
  and not coalesce("allowedScopes", '[]'::jsonb) ? 'field.customer_access.create';
