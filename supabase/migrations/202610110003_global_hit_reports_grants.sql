-- Service-role write access for the generate-global-hits edge function.
-- Reads stay public (see 202610110002); the service key itself never ships
-- in the mobile app and lives only as a function secret.
grant select, insert, update, delete on public.global_hit_reports to service_role;
