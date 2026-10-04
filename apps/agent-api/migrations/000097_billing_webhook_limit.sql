-- A-13: configured 15-minute IP limits can reach 100000; the saturated
-- counter keeps one extra attempt to represent denial without growing forever.
alter table ap.billing_webhook_ip_windows drop constraint billing_webhook_ip_windows_attempts_check;
alter table ap.billing_webhook_ip_windows add constraint billing_webhook_ip_windows_attempts_check
  check(attempts between 1 and 100001);
-- Rollback: clamp attempts to 1001 and restore the 1..1001 check only after
-- lowering AP_BILLING_WEBHOOK_IP_LIMIT to <=1000; preserve the window timestamps.
