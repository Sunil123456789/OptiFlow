# OptiFlow

Open-source preventive maintenance and plant operations system for manufacturing teams.

## Product Docs (OptiFlow)
- Requirements Specification: `docs/OPTIFLOW_REQUIREMENTS.md`
- System Flow Chart (SFC): `docs/OPTIFLOW_SFC.md`
- Requirements Matrix: `docs/OPTIFLOW_REQUIREMENTS_MATRIX.csv`

## Problem
Small manufacturing units often perform maintenance only after a machine fails. This leads to expensive downtime, delayed orders, and emergency repair costs.

## MVP Goal
Help operations and maintenance teams prevent avoidable breakdowns by planning and tracking maintenance based on runtime and criticality.

## Core Modules
- Machine Registry
- Preventive Maintenance Plans
- Work Orders
- Failure Logs
- Alerts and Notifications
- KPI Dashboard (MTBF, MTTR, downtime, repair cost)

## Suggested Tech Stack
- Frontend: React + TypeScript
- Backend: FastAPI (Python)
- Database: PostgreSQL
- Queue/Jobs: Redis + Celery (or RQ)
- Auth: JWT + role-based access control
- Deployment: Docker Compose

## Repo Structure
```text
OptiFlow/
  README.md
  docs/
    FEATURE_BACKLOG.md
    API_SPEC.md
    ROADMAP_30_DAYS.md
  db/
    schema.sql
  infra/
    docker-compose.yml
  backend/
    app/
      main.py
```

## First Build Order
1. Implement database schema (`db/schema.sql`).
2. Build auth + machine CRUD APIs.
3. Add maintenance plan and work order flow.
4. Add failure logs and KPI endpoints.
5. Build dashboard UI and alerts.

## Run Backend Locally (Step 1)
1. Start infrastructure:
```powershell
cd infra
docker compose up -d
cd ..
```
2. Prepare backend environment:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```
3. Apply migrations and load sample data:
```powershell
alembic upgrade head
docker exec -i optiflow-db psql -U optiflow -d optiflow < ..\db\seed.sql
```
4. Run API:
```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Quick Checks
- `GET http://localhost:8000/health`
- `GET http://localhost:8000/ready`

## Dev Auth (Current)
- API routes under `/api/v1/*` are protected with Bearer token auth.
- Login endpoint: `POST /api/v1/auth/login`
- Default dev credentials:
  - `email`: `admin@optiflow.local`
  - `password`: `changeme`
- Frontend currently auto-fetches a dev token for local development.

## RBAC (Current)
- Admin can create custom roles in UI and configure permissions:
  - Manage users
  - Manage assets (machines/plans)
  - Create work orders
  - Update work orders
- Users can be assigned any configured role.

## Frontend Starter (Step 2)
1. Install dependencies and run dev server:
```powershell
cd frontend
npm install
npm run dev
```
2. Open: `http://localhost:5173`
3. Dashboard uses: `http://localhost:8000/api/v1/dashboard/summary`

## Frontend Features (Current)
- Users & Roles:
  - Create, edit, delete users
  - Enable or disable users
  - Create, edit, delete custom roles
  - Enable or disable custom roles
  - Assign any role to users from dynamic role list
- Machines:
  - Create, edit, delete
  - Search and sort (server-side)
  - Export CSV and PDF for all matching records (not only current page)
- Maintenance Plans:
  - Create, edit, delete
  - Search, filter by type, sort (server-side)
  - Export CSV and PDF for all matching records (not only current page)
- Work Orders:
  - Create, edit, delete
  - Search, filter by status/priority, sort (server-side)
  - Export CSV and PDF for all matching records (not only current page)

## End-to-End Local Run (Step 3)
From project root:

```powershell
cd scripts
.\start-dev.ps1
```

Verify all services:

```powershell
.\verify-e2e.ps1
```

Verify complete Phase-2 master import flow (dry-run + apply + history + rollback + integrity):

```powershell
.\verify-master-import-workflow.ps1
```

Stop everything:

```powershell
.\stop-dev.ps1
```

What `start-dev.ps1` does:
- Starts PostgreSQL + Redis containers
- Creates backend venv if needed and installs dependencies
- Applies Alembic migrations and runs seed data
- Launches backend (`uvicorn`) and frontend (`vite`) in separate PowerShell windows

## Production Deployment (Docker)
1. Create production env files from templates:
```powershell
Copy-Item backend\.env.production.example backend\.env
Copy-Item frontend\.env.production.example frontend\.env.production
```
2. Update `backend/.env` values, especially:
- `JWT_SECRET_KEY`
- `CORS_ALLOW_ORIGINS` (comma-separated trusted frontend origins)
- `DATABASE_URL`
- `REDIS_URL`
3. Run production env preflight check:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-prod-env.ps1
```
4. Build and run containers:
```powershell
docker compose -f docker-compose.prod.yml up --build -d
```
5. Access services:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
6. Stop containers:
```powershell
docker compose -f docker-compose.prod.yml down
```

## Data Backup and Restore
Create a backup ZIP of JSON stores:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-data.ps1
```

Optional parameters:
- `-OutputDir "C:\backups\optiflow"` to choose backup location
- `-KeepLast 30` to keep only latest N backups

Restore from a backup ZIP:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore-data.ps1 -BackupZip .\backups\optiflow_data_backup_YYYYMMDD_HHMMSS.zip
```

## Definition of MVP Success
- Team can register machines and create PM plans.
- Work orders are automatically generated for due plans.
- Breakdown events are captured with downtime and cost.
- Dashboard shows actionable preventive metrics weekly.

