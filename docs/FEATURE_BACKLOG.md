# Feature Backlog

## P0 (Must Have)
- User authentication (Admin, Maintenance Manager, Technician, Viewer)
- Machine registry CRUD
- Maintenance plan CRUD (calendar-based and runtime-based)
- Automatic due work order generation
- Work order lifecycle: open, in_progress, done, overdue
- Failure log entry with root cause, downtime, cost
- Basic dashboard: total downtime, failure count, overdue tasks
- Audit fields (`created_at`, `updated_at`, `created_by`)

## P1 (Should Have)
- Spare parts inventory and consumption tracking
- Alert channels: email, SMS, WhatsApp webhook
- Recurring checklists per machine type
- MTBF and MTTR trend charts
- CSV export for maintenance reports

## P2 (Nice to Have)
- IoT runtime ingestion API
- Predictive maintenance scoring
- Multi-plant benchmarking
- Mobile technician app
- Offline-first mode for shop-floor usage

## Non-Functional Requirements
- API response under 500ms for common reads
- Role-based access controls on all endpoints
- 99.5% service availability target
- Daily backup and restore procedure
- Structured logs and error monitoring
