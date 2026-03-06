# OptiFlow Operator Runbook

This runbook is for admins/operators managing master data and recovery workflows.

## Daily Health Checks
1. Backend health: `GET /health`
2. Backend readiness: `GET /ready`
3. UI reachable: `http://localhost:5173`
4. Audit logs accessible for admin users

## Master Data Import (Safe Path)
1. Go to `Plant Map`.
2. Upload CSV/XLSX file.
3. Run `Validate Only` first.
4. Confirm row counts and validation output.
5. Run `Import CSV` only after dry-run results look correct.
6. Verify hierarchy cards and data tables update correctly.

## Import Rollback
Use this when incorrect import data was applied.
1. Open import history section in `Plant Map`.
2. Identify target batch by timestamp/source file.
3. Click rollback for that batch.
4. Confirm rollback success message.
5. Re-check departments, lines, and stations.
6. Confirm rollback event in audit logs.

## Integrity Monitoring
Check these metrics after each major import:
- orphan lines
- orphan stations
- duplicate codes (department/line/station)
- inactive parent relationships

Expected normal state: all integrity counters at zero.

## Backup Procedure
Manual backup command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-data.ps1 -KeepLast 30
```

Expected output includes `[PASS] Backup created:`.

## Restore Procedure
Use for accidental data deletion/corruption.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore-data.ps1 -BackupZip .\backups\optiflow_data_backup_YYYYMMDD_HHMMSS.zip
```

After restore:
1. Restart backend service.
2. Run `scripts/verify-e2e.ps1`.
3. Verify recent audit/import history data appears.

## Incident Response (Quick)
1. Stop new imports immediately.
2. Export audit logs for incident window.
3. Rollback latest import batch if issue is import-related.
4. Restore latest known-good backup if rollback is insufficient.
5. Document root cause and corrective actions.
