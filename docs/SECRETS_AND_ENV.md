# Secrets and Environment Hardening

This guide defines how to handle application secrets and environment files safely.

## Environment File Policy
- Keep production values only in deployment environment stores or secure vaults.
- Do not commit real secrets in `backend/.env` or `frontend/.env.production`.
- Commit templates only (`.env.example`, `.env.production.example`).
- Use `scripts/check-prod-env.ps1` before every production deployment.

## Required Backend Secrets
- `JWT_SECRET_KEY`: use a long random value (minimum 32 chars).
- `DATABASE_URL`: production DB endpoint with least-privilege credentials.
- `REDIS_URL`: production Redis endpoint.
- `CORS_ALLOW_ORIGINS`: explicit trusted frontend origin list.

## Secret Rotation (Recommended)
Rotate these every 90 days, or immediately after suspected exposure:
- `JWT_SECRET_KEY`
- database password in `DATABASE_URL`
- Redis credentials (if enabled)

Rotation workflow:
1. Generate new secret values in a secure secret manager.
2. Update deployment environment values.
3. Restart backend service.
4. Run smoke checks (`/health`, `/ready`, login API).
5. Verify role-sensitive endpoints (`/api/v1/users`, `/api/v1/master-data/import-history`).

## Local Development Safety
- Use non-production credentials only.
- Keep `backend/.env` local; do not share in chat/email.
- If local secrets are leaked, regenerate them and re-login.

## Deployment Preflight Checklist
1. `scripts/check-prod-env.ps1` returns `[PASS]`.
2. No placeholder values remain in env files.
3. `docker compose -f docker-compose.prod.yml up --build -d` succeeds.
4. `scripts/verify-e2e.ps1` and `scripts/verify-master-import-workflow.ps1` pass.
