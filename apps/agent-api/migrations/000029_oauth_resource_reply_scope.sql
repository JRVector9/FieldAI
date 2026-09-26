update "oauthResource"
set "allowedScopes" = '["ap.agent.read","ap.conversations.read","ap.conversations.reply"]'::jsonb
where identifier ~ '^https?://[^/]+/integrations/v1$'
  and "allowedScopes" = '["ap.agent.read","ap.conversations.read"]'::jsonb;
