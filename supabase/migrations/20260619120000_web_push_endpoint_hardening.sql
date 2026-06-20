-- Constrain new browser Web Push endpoints to known push providers. Existing
-- rows are left unvalidated so deploys do not fail on legacy data; the sender
-- functions prune invalid stored rows at runtime before any outbound request.

alter table public.web_push_subscriptions
  add constraint web_push_subscriptions_endpoint_allowed
  check (
    endpoint ~* '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)(:443)?/'
  ) not valid;
