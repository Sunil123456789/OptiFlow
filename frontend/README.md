# OptiFlow Frontend

React + TypeScript dashboard starter for maintenance operations.

## Run
```powershell
npm install
npm run dev
```

App URL: `http://localhost:5173`

## Pages
- Overview
- Machines
- Plans
- Work Orders

## Backend Dependency
The Overview page requests dashboard summary from:
`GET http://localhost:8000/api/v1/dashboard/summary`

If the backend is unavailable, the app shows fallback values and an error banner.

