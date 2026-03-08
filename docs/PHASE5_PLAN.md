# OptiFlow Phase-5 Plan

## Goal
Expand OptiFlow from preventive-maintenance execution into proactive reliability optimization with external alerting, richer maintenance operations, and predictive insights.

## Priority Workstreams

### P1: Alert Delivery Channels
- Add delivery adapters for email and webhook notifications.
- Add per-channel enable/disable and retry policy.
- Record delivery attempts and outcomes for auditability.

Definition of done:
- Alerts can be sent to at least one external channel.
- Failed sends are retried and visible in logs.
- Admin can configure channel settings safely.

### P1: Spare Parts Inventory and Consumption
- Add parts catalog with stock, minimum threshold, and unit cost.
- Link part consumption to work-order completion.
- Add low-stock alerts and usage history.

Definition of done:
- Technicians can record consumed parts on work orders.
- Stock decreases automatically after confirmed consumption.
- Low-stock alerts are visible in alert center.

### P1: Checklist Templates by Machine Type
- Add recurring checklist templates mapped to machine type.
- Auto-attach checklists to generated work orders.
- Track completion status at checklist item level.

Definition of done:
- Generated work orders include checklist items when configured.
- Checklist completion is persisted and reportable.

### P2: Predictive Reliability Scoring
- Add baseline scoring endpoint using failure frequency, downtime trend, and overdue maintenance ratio.
- Display machine-level risk score and top contributing factors.
- Add monthly risk trend in reports.

Definition of done:
- Every active machine has a computed risk score.
- Score calculation is transparent and reproducible.

### P2: Multi-Plant Benchmarking Foundation
- Introduce plant dimension for major entities and report filters.
- Add cross-plant summary KPIs (MTBF, MTTR, downtime).

Definition of done:
- Data can be filtered by plant without regression to existing flows.
- Reports provide plant-level comparisons.

## Suggested Implementation Sequence
1. Parts inventory data model and APIs.
2. Work-order parts consumption and stock reconciliation.
3. Checklist template APIs and UI integration.
4. External alert channel delivery service.
5. Predictive scoring endpoint and dashboard widgets.
6. Plant dimension and benchmarking report extensions.
7. E2E and smoke test expansion for new domains.

## Estimated Effort
- Alert delivery channels: 2-3 days
- Spare parts inventory: 3-4 days
- Checklist templates: 2-3 days
- Predictive scoring baseline: 2-3 days
- Multi-plant foundation: 3-4 days
- Testing and docs hardening: 1-2 days

Total: 13-19 working days.
