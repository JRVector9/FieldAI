update "oauthResource"
set "allowedScopes" = '["offline_access","ap.agent.read","ap.conversations.read","ap.conversations.reply"]'::jsonb,
    "updatedAt" = now()
where "identifier" ~ '^https?://[^/]+/integrations/v1$'
  and not coalesce("allowedScopes", '[]'::jsonb) ? 'offline_access';
