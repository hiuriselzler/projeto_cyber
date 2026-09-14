"""The web deletion page's confirmation links, and the one lookup that reads them (task 019).

A table of its own rather than a purpose column on another token table, so no reset or
verification link can be replayed at the deletion route. Owned like every token table: row-level
security enabled, forced and failing closed, and gone with its account by cascade (ADR-011,
03 §10). The lookup is the seventh function on ADR-011's allowlist.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-14
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The fail-closed scope, as in 0002: unset or empty means no user, which matches no row (ADR-011).
SCOPE = "NULLIF(current_setting('app.user_id', true), '')::uuid"

UPGRADE = """
CREATE TABLE account_deletion_tokens (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL
);
CREATE INDEX account_deletion_tokens_user_id_idx ON account_deletion_tokens (user_id)
    WHERE used_at IS NULL;

ALTER TABLE account_deletion_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY account_deletion_tokens_owner ON account_deletion_tokens
    USING (user_id = __SCOPE__) WITH CHECK (user_id = __SCOPE__);

CREATE FUNCTION auth_redeem_deletion_token(p_token_hash text)
RETURNS TABLE (user_id uuid, expires_at timestamptz, used boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT t.user_id, t.expires_at, t.used_at IS NOT NULL
    FROM public.account_deletion_tokens t WHERE t.token_hash = p_token_hash
$$;
REVOKE ALL ON FUNCTION auth_redeem_deletion_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_redeem_deletion_token(text) TO cyberathlete_app;
"""


def upgrade() -> None:
    op.execute(UPGRADE.replace("__SCOPE__", SCOPE))


def downgrade() -> None:
    op.execute(
        """
        DROP FUNCTION auth_redeem_deletion_token(text);
        DROP TABLE account_deletion_tokens;
        """
    )
