-- CyberAthlete database roles — ADR-011.
--
-- One idempotent script for every environment. The compose init step runs it locally; each managed
-- environment runs it once by hand with the provider's admin user, whose credentials never reach the
-- API or CI. Safe to re-run.
--
-- Passwords arrive as psql variables and are never written here:
--
--   psql -v ON_ERROR_STOP=1 -v dbname=cyberathlete \
--        -v migrator_password=... -v app_password=... -f roles.sql
--
-- Run it before the first migration: default privileges apply only to tables created afterwards.

\set ON_ERROR_STOP on

-- cyberathlete_migrator — Alembic, seeds, batched backfills, the deploy's release step.
-- Owns every table it creates, and bypasses RLS because backfills touch every user's rows. That is why
-- the running API never connects as it.
SELECT 'CREATE ROLE cyberathlete_migrator'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cyberathlete_migrator')
\gexec

ALTER ROLE cyberathlete_migrator
    WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS
    PASSWORD :'migrator_password';

-- cyberathlete_app — the running API and every job it runs. Cannot skip RLS, owns nothing, and
-- belongs to no other role. The API checks all three at boot and refuses to start otherwise.
SELECT 'CREATE ROLE cyberathlete_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cyberathlete_app')
\gexec

ALTER ROLE cyberathlete_app
    WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    PASSWORD :'app_password';

-- Membership in another role would let the app role SET ROLE its way out of RLS. Remove any that exist.
DO $$
DECLARE
    granted record;
BEGIN
    FOR granted IN
        SELECT r.rolname
        FROM pg_auth_members m
        JOIN pg_roles r ON r.oid = m.roleid
        WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = 'cyberathlete_app')
    LOOP
        EXECUTE format('REVOKE %I FROM cyberathlete_app', granted.rolname);
    END LOOP;
END
$$;

-- Everything below is per database.
\connect :"dbname"

REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"dbname" TO cyberathlete_app;
-- CREATE on the database lets the migrator install trusted extensions such as citext (task 002).
GRANT CONNECT, TEMPORARY, CREATE ON DATABASE :"dbname" TO cyberathlete_migrator;

-- Only the migrator may create objects. The app role can use the schema and nothing more: no DDL.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO cyberathlete_migrator;
GRANT USAGE ON SCHEMA public TO cyberathlete_app;

-- DML on every table the migrator creates, so a new table can never be forgotten. `FOR ROLE` is what
-- makes these apply to the migrator's tables; without it they would apply to tables created by whoever
-- runs this script, and the app role would receive nothing.
ALTER DEFAULT PRIVILEGES FOR ROLE cyberathlete_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cyberathlete_app;

ALTER DEFAULT PRIVILEGES FOR ROLE cyberathlete_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO cyberathlete_app;

-- Functions are not executable by default. Each allowlisted SECURITY DEFINER function grants EXECUTE to
-- cyberathlete_app explicitly (ADR-011).
ALTER DEFAULT PRIVILEGES FOR ROLE cyberathlete_migrator
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
