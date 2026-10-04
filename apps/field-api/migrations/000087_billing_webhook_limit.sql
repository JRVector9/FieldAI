-- The configured shared-sender cap may exceed 1000. Keep one overflow count so
-- every request beyond a finite operator cap continues to receive 429.
alter table field.billing_webhook_ip_windows drop constraint billing_webhook_ip_windows_attempts_check;
alter table field.billing_webhook_ip_windows add constraint billing_webhook_ip_windows_attempts_check check(attempts between 1 and 100001);
-- Downgrade only after resetting/expiring windows above the previous 1001 bound.
