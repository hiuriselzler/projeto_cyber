"""The only module that reads rows without a user scope (ADR-011).

It calls the allowlisted SECURITY DEFINER functions — a user by email at login, a token by its hash,
the cross-user retention sweeps — and nothing else. Only app.services.auth and
app.services.maintenance may import it; import-linter enforces that. Empty until task 003.
"""
