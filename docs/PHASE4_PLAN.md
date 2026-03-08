# OptiFlow Phase-4 Plan

## Goal
Improve operational reliability and decision support after Phase-3 by adding alerting, SLA tracking, reporting, and RBAC UX improvements.

## Priority Workstreams

### P1: Alerts and Notifications
- Add backend alert rules for:
  - repeated machine failures within a configurable time window
  - overdue preventive plans
  - failed master-data imports
- Add alert listing endpoint with acknowledged/unacknowledged status.
- Add frontend alert center page and header badge count.
- Add audit events for alert acknowledge/resolve actions.

Definition of done:
- Alert rules execute on schedule.
- Operators can acknowledge alerts in UI.
- Alert counts appear in dashboard/header.

### P1: SLA and Escalation Tracking
- Define SLA thresholds per failure severity (response and resolution).
- Track timestamps and SLA state for each failure log entry.
- Add escalation marker for SLA breaches.
- Add KPI cards: active breaches, average response time, average resolution time.

Definition of done:
- Failure logs display SLA status.
- Breaches are queryable via API.
- Dashboard shows SLA KPIs.

### P2: Reporting and Export
- Add monthly reliability report endpoint (MTBF, MTTR, downtime by line/machine).
- Add CSV export for failure logs and KPI trend data.
- Add a simple reports page with date range picker.

Definition of done:
- Reports support date filtering.
- CSV export works for operators/admins with permission.

### P2: RBAC and Admin UX Polish
- Add explicit role-permission matrix view in admin settings.
- Add guardrails for high-risk actions (double-confirm for rollback/delete).
- Improve error messaging for permission failures.

Definition of done:
- Permissions are easier to audit from UI.
- Risky actions have clearer confirmation and audit trace.

## Suggested Implementation Sequence
1. Backend alert domain model and APIs.
2. Frontend alert center and dashboard badge.
3. SLA fields and breach detection on failure logs.
4. Reporting endpoints and CSV export.
5. RBAC/admin UX polish.
6. End-to-end tests and updated operator runbook.

## Estimated Effort
- Alerts and notifications: 3-4 days
- SLA tracking: 2-3 days
- Reporting/export: 2-3 days
- RBAC/admin UX polish: 1-2 days
- Testing/docs hardening: 1 day

Total: 9-13 working days.
