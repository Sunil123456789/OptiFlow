# API Specification (MVP)

Base URL: `/api/v1`

## Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

## Machines
- `POST /machines`
- `GET /machines`
- `GET /machines/{machine_id}`
- `PATCH /machines/{machine_id}`
- `DELETE /machines/{machine_id}`

## Maintenance Plans
- `POST /maintenance-plans`
- `GET /maintenance-plans`
- `GET /maintenance-plans/{plan_id}`
- `PATCH /maintenance-plans/{plan_id}`
- `DELETE /maintenance-plans/{plan_id}`

## Work Orders
- `POST /work-orders`
- `GET /work-orders`
- `GET /work-orders/{work_order_id}`
- `PATCH /work-orders/{work_order_id}`
- `POST /work-orders/{work_order_id}/start`
- `POST /work-orders/{work_order_id}/complete`

## Failure Logs
- `POST /failure-logs`
- `GET /failure-logs`
- `GET /failure-logs/{failure_id}`
- `PATCH /failure-logs/{failure_id}`

## Dashboard
- `GET /dashboard/summary`
- `GET /dashboard/mtbf`
- `GET /dashboard/mttr`
- `GET /dashboard/downtime-trend`

## Alerts
- `POST /alerts/test`
- `GET /alerts/config`
- `PATCH /alerts/config`

## Sample Response: `GET /dashboard/summary`
```json
{
  "total_machines": 125,
  "open_work_orders": 17,
  "overdue_work_orders": 5,
  "downtime_hours_30d": 142.5,
  "repair_cost_30d": 85300,
  "failure_count_30d": 21
}
```
