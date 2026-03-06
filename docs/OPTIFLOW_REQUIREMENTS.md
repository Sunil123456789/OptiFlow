# OptiFlow Requirements Specification

## 1. Product Summary
- Product Name: OptiFlow
- Domain: Eyewear manufacturing maintenance and plant operations
- Product Type: Web-based maintenance and reliability platform
- Primary Users: Plant head, maintenance supervisor, technicians, production shift leads, quality engineers, utilities engineers

## 2. Vision
OptiFlow helps manufacturing plants prevent downtime, improve quality, and increase throughput by combining machine lifecycle management, preventive maintenance, work-order execution, and role-based operational governance.

## 3. Business Goals
- Reduce unplanned downtime by at least 15% in 6 months.
- Improve PM compliance to at least 90%.
- Reduce MTTR by at least 20% through better assignment and spare readiness.
- Improve first-pass yield by linking quality issues to machine history.

## 4. Scope
### In Scope
- Multi-role user and custom role management.
- Machine registry with criticality and status.
- Preventive maintenance plans (calendar and runtime based).
- Work-order lifecycle management.
- Search/filter/sort with server-side pagination.
- CSV/PDF exports for full matching datasets.
- Role and user enable/disable controls.

### Out of Scope (Phase 1)
- Native mobile app.
- Auto-ingestion from PLC/SCADA.
- AI failure prediction.
- ERP procurement workflows.

## 5. User Roles and Permissions
- Permissions are capability-based:
  - `can_manage_users`
  - `can_manage_assets`
  - `can_create_work_orders`
  - `can_update_work_orders`
- Admin can create custom roles, assign permissions, and enable/disable roles.
- Users can be enabled/disabled independently.

## 6. Functional Requirements
- FR-001: System shall support secure login using JWT authentication.
- FR-002: System shall allow admins to create, update, delete, enable, and disable users.
- FR-003: System shall allow admins to create, update, delete, enable, and disable custom roles.
- FR-004: System shall enforce capability-based authorization on all write operations.
- FR-005: System shall allow machine CRUD with criticality and lifecycle status.
- FR-006: System shall allow maintenance plan CRUD with calendar/runtime plan types.
- FR-007: System shall allow work-order CRUD with status and priority tracking.
- FR-008: System shall provide paginated list APIs with server-side search/filter/sort.
- FR-009: System shall provide full-data export endpoints honoring current filters/sorts.
- FR-010: System shall expose dashboard summary KPIs for quick operational visibility.
- FR-011: System shall block login and privileged actions for users with disabled or invalid roles.
- FR-012: System shall provide health (`/health`) and readiness (`/ready`) endpoints.

## 7. Non-Functional Requirements
- NFR-001: API response for list endpoints should be under 500 ms for datasets up to 10k rows.
- NFR-002: Platform shall support at least 100 concurrent users in Phase 1 deployment.
- NFR-003: All critical API actions shall return explicit status codes and error details.
- NFR-004: Production must use environment-driven CORS configuration.
- NFR-005: All requests shall be logged with method, path, status, and latency.
- NFR-006: Production deployment shall support container health checks and restart policies.

## 8. Data Requirements
- Core entities:
  - User
  - Role
  - Machine
  - MaintenancePlan
  - WorkOrder
- Mandatory fields:
  - User: full_name, email, role, is_active
  - Role: name, permissions, is_active, is_system
  - Machine: machine_code, name, criticality, status
  - MaintenancePlan: plan_code, machine_id, title, plan_type, next_due, is_active
  - WorkOrder: work_order_code, machine_id, status, priority

## 9. API Requirements (High-Level)
- Auth:
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
- Roles:
  - `GET /api/v1/roles`
  - `POST /api/v1/roles`
  - `PATCH /api/v1/roles/{role_name}`
  - `DELETE /api/v1/roles/{role_name}`
- Users:
  - `GET /api/v1/users`
  - `POST /api/v1/users`
  - `PATCH /api/v1/users/{user_id}`
  - `DELETE /api/v1/users/{user_id}`
- Machines, Plans, Work Orders:
  - list/create/get/update/delete + export endpoints

## 10. UX Requirements
- RQ-UX-001: Core modules must be accessible within one-click tab navigation.
- RQ-UX-002: Edit operations should use modal dialogs instead of browser prompts.
- RQ-UX-003: All list pages should show paging metadata and previous/next controls.
- RQ-UX-004: Enable/Disable actions should be explicit and visible in user/role tables.
- RQ-UX-005: Error messages should be actionable and close to the affected action.

## 11. Security and Compliance
- SEC-001: JWT secret must be environment-managed in production.
- SEC-002: Role and permission checks must run server-side for every protected endpoint.
- SEC-003: Disabled roles/users must not execute restricted workflows.
- SEC-004: CORS must restrict origins to approved domains in production.

## 12. Acceptance Criteria
- AC-001: Admin can create a custom role and assign it to a new user.
- AC-002: A disabled user cannot authenticate successfully.
- AC-003: A user assigned a role with no write permissions cannot perform write APIs.
- AC-004: Exports return all matching records, not just current page.
- AC-005: E2E verification passes including auth, roles, users, filtered list, and export checks.

## 13. Release Plan
- Release 1: Core platform stability and governance
  - Auth, RBAC, users/roles, machines/plans/work-orders, pagination, exports
- Release 2: Plant specialization
  - Department metadata, downtime reason codes, shift analytics, PM templates by asset family
- Release 3: Enterprise integration
  - ERP connectors, SCADA counters, advanced KPI and predictive modules
