# Frontend Architecture

This document defines the Phase 1 and Phase 2 structure for `frontend/src`.

## Goals

- Keep orchestration code in one place.
- Move domain logic into reusable hooks and modules.
- Keep navigation rules and page routing centralized.
- Make new feature work predictable for all contributors.

## Current Layering

- `App.tsx`
  - App orchestration only.
  - Wires auth, summary, alerts count, tab state, and active page rendering.
- `hooks/`
  - `useAuthSession.ts`: token bootstrap and user session lifecycle.
  - `useDashboardSummary.ts`: dashboard summary loading and fallback error handling.
  - `useOpenAlertCount.ts`: alert polling for open count.
  - `index.ts`: barrel exports for stable imports.
- `lib/navigation.ts`
  - Defines `AppTab` contract.
  - Owns visible-tab logic by user permission.
  - Owns safe-tab fallback logic.
- `lib/pageRegistry.tsx`
  - Maps `AppTab` to page component.
  - Keeps page-selection logic away from `App.tsx`.
- `components/`
  - Reusable presentation components such as `Header`.
- `pages/`
  - Page containers for each business area.

## Rules

- `App.tsx` should not call API functions directly.
- Permission logic should live in `lib/navigation.ts`, not in components.
- Page-selection switch/case should live in `lib/pageRegistry.tsx`.
- Hooks should own side effects and polling timers.
- Pages should receive data through props and hooks, not global mutable state.

## Next Refactor Phases

- Phase 3:
  - Refactor `AlertsPage`, `WorkOrdersPage`, `OverviewPage` into feature folders.
  - Extract `services` and `components` per feature.
- Phase 4:
  - Add shared UI primitives (`PageShell`, `FilterBar`, `DataTable`, `StatusBadge`).
- Phase 5:
  - Add targeted tests for hooks and page registry behavior.

## Proposed Feature Folder Pattern

For each future feature:

- `features/<feature-name>/components/`
- `features/<feature-name>/hooks/`
- `features/<feature-name>/services/`
- `features/<feature-name>/types.ts`
