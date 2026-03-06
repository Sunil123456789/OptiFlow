import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  createDepartment,
  createLine,
  createStation,
  deleteDepartment,
  deleteLine,
  deleteStation,
  fetchDepartments,
  fetchImportHistory,
  fetchLines,
  fetchPlantIntegrityChecks,
  fetchStations,
  importMasterDataCsv,
  rollbackImportBatch,
  validateMasterDataCsv,
} from "../lib/api";
import { canImportMasterData, canManageAssets } from "../lib/permissions";
import type {
  AuthUser,
  Department,
  ImportHistoryItem,
  Line,
  MasterImportResult,
  PlantIntegrityReport,
  Station,
} from "../lib/types";

const SAMPLE_CSV = [
  "entity_type,code,name,parent_code,is_active",
  "department,FRAME,Frame Manufacturing,,true",
  "line,FRM-L2,Frame Line 2,FRAME,true",
  "station,ST-FRM-02,Frame Alignment Station,FRM-L2,true",
].join("\n");

type PlantMapPageProps = {
  currentUser: AuthUser;
};

const REQUIRED_HEADERS = ["entity_type", "code", "name", "parent_code", "is_active"];

type CsvValidationResult = {
  errors: string[];
  rowCount: number;
};

type XlsxSheetBundle = {
  sheetNames: string[];
  csvBySheet: Record<string, string>;
};

let xlsxModulePromise: Promise<typeof import("xlsx")> | null = null;

function getXlsxModule(): Promise<typeof import("xlsx")> {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("xlsx");
  }
  return xlsxModulePromise;
}

function validateMasterCsv(csvText: string): CsvValidationResult {
  const rows = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rows.length === 0) {
    return { errors: ["CSV is empty."], rowCount: 0 };
  }

  const headerCells = rows[0].split(",").map((cell) => cell.trim().toLowerCase());
  const headerSet = new Set(headerCells);
  const missing = REQUIRED_HEADERS.filter((header) => !headerSet.has(header));
  const errors: string[] = [];
  if (missing.length > 0) {
    errors.push(`Missing required headers: ${missing.join(", ")}`);
    return { errors, rowCount: Math.max(0, rows.length - 1) };
  }

  for (let i = 1; i < rows.length; i += 1) {
    const rawCells = rows[i].split(",");
    const lineNumber = i + 1;
    if (rawCells.length < REQUIRED_HEADERS.length) {
      errors.push(`Row ${lineNumber}: expected ${REQUIRED_HEADERS.length} columns, found ${rawCells.length}.`);
      continue;
    }

    const cells = rawCells.map((cell) => cell.trim());
    const rowMap = new Map<string, string>();
    headerCells.forEach((header, index) => {
      rowMap.set(header, cells[index] ?? "");
    });

    const entityType = (rowMap.get("entity_type") ?? "").toLowerCase();
    const code = rowMap.get("code") ?? "";
    const name = rowMap.get("name") ?? "";
    const parentCode = rowMap.get("parent_code") ?? "";
    const isActive = (rowMap.get("is_active") ?? "").toLowerCase();

    if (!["department", "line", "station"].includes(entityType)) {
      errors.push(`Row ${lineNumber}: entity_type must be department, line, or station.`);
    }
    if (!code) {
      errors.push(`Row ${lineNumber}: code is required.`);
    }
    if (!name) {
      errors.push(`Row ${lineNumber}: name is required.`);
    }
    if ((entityType === "line" || entityType === "station") && !parentCode) {
      errors.push(`Row ${lineNumber}: parent_code is required for ${entityType}.`);
    }
    if (!["true", "false", "1", "0", "yes", "no", "y", "n", ""].includes(isActive)) {
      errors.push(`Row ${lineNumber}: is_active must be true/false/1/0/yes/no/y/n.`);
    }
  }

  return { errors, rowCount: Math.max(0, rows.length - 1) };
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function toCsvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

async function parseXlsxSheets(fileBuffer: ArrayBuffer): Promise<XlsxSheetBundle> {
  const XLSX = await getXlsxModule();
  const workbook = XLSX.read(fileBuffer, { type: "array" });
  if (workbook.SheetNames.length === 0) {
    throw new Error("XLSX file has no sheets.");
  }

  const csvBySheet: Record<string, string> = {};
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });

    const csv = matrix.map((row) => row.map((cell) => toCsvCell(String(cell ?? "").trim())).join(",")).join("\n");
    csvBySheet[sheetName] = csv;
  }

  return { sheetNames: workbook.SheetNames, csvBySheet };
}

export function PlantMapPage({ currentUser }: PlantMapPageProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [departmentCode, setDepartmentCode] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [lineCode, setLineCode] = useState("");
  const [lineName, setLineName] = useState("");
  const [lineDepartmentCode, setLineDepartmentCode] = useState("");
  const [stationCode, setStationCode] = useState("");
  const [stationName, setStationName] = useState("");
  const [stationLineCode, setStationLineCode] = useState("");

  const [importCsv, setImportCsv] = useState(SAMPLE_CSV);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [xlsxSheetNames, setXlsxSheetNames] = useState<string[]>([]);
  const [xlsxCsvBySheet, setXlsxCsvBySheet] = useState<Record<string, string>>({});
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [importSummary, setImportSummary] = useState<MasterImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isValidatingImport, setIsValidatingImport] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<PlantIntegrityReport | null>(null);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);

  const csvValidation = useMemo(() => validateMasterCsv(importCsv), [importCsv]);

  const previewTable = useMemo(() => {
    const rows = importCsv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (rows.length === 0) {
      return { headers: [] as string[], body: [] as string[][] };
    }

    const headers = parseCsvLine(rows[0]);
    const body = rows.slice(1, 6).map((row) => parseCsvLine(row));
    return { headers, body };
  }, [importCsv]);

  function handleImportCsvChange(value: string) {
    setImportCsv(value);
    if (xlsxSheetNames.length > 0) {
      setXlsxSheetNames([]);
      setXlsxCsvBySheet({});
      setSelectedSheetName("");
    }
  }

  function downloadTemplateCsv() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plant_master_template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function downloadTemplateXlsx() {
    const XLSX = await getXlsxModule();
    const rows = [
      ["entity_type", "code", "name", "parent_code", "is_active"],
      ["department", "FRAME", "Frame Manufacturing", "", "true"],
      ["line", "FRM-L2", "Frame Line 2", "FRAME", "true"],
      ["station", "ST-FRM-02", "Frame Alignment Station", "FRM-L2", "true"],
    ];

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "master_data");
    XLSX.writeFile(workbook, "plant_master_template.xlsx");
  }

  async function handleUploadCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const arrayBuffer = await file.arrayBuffer();
        const workbookData = await parseXlsxSheets(arrayBuffer);
        setXlsxSheetNames(workbookData.sheetNames);
        setXlsxCsvBySheet(workbookData.csvBySheet);

        const firstSheet = workbookData.sheetNames[0] ?? "";
        setSelectedSheetName(firstSheet);
        setImportCsv(workbookData.csvBySheet[firstSheet] ?? "");
      } else {
        const text = await file.text();
        setImportCsv(text);
        setXlsxSheetNames([]);
        setXlsxCsvBySheet({});
        setSelectedSheetName("");
      }
      setUploadedFileName(file.name);
      setError(null);
    } catch {
      setError("Could not read uploaded file. Use CSV/XLSX with expected columns.");
    } finally {
      event.target.value = "";
    }
  }

  function handleSelectSheet(sheetName: string) {
    setSelectedSheetName(sheetName);
    const csv = xlsxCsvBySheet[sheetName] ?? "";
    setImportCsv(csv);
  }

  async function loadAll() {
    try {
      setIsLoading(true);
      const [departmentsData, linesData, stationsData] = await Promise.all([
        fetchDepartments(),
        fetchLines(),
        fetchStations(),
      ]);
      setDepartments(departmentsData);
      setLines(linesData);
      setStations(stationsData);
      if (departmentsData.length > 0 && !lineDepartmentCode) {
        setLineDepartmentCode(departmentsData[0].code);
      }
      if (linesData.length > 0 && !stationLineCode) {
        setStationLineCode(linesData[0].code);
      }

      const [integrityData, historyData] = await Promise.all([fetchPlantIntegrityChecks(), fetchImportHistory()]);
      setIntegrityReport(integrityData);
      setImportHistory(historyData);
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load plant mapping data.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linesByDepartment = useMemo(() => {
    const lookup = new Map<string, number>();
    for (const line of lines) {
      lookup.set(line.department_code, (lookup.get(line.department_code) ?? 0) + 1);
    }
    return lookup;
  }, [lines]);

  const stationsByLine = useMemo(() => {
    const lookup = new Map<string, number>();
    for (const station of stations) {
      lookup.set(station.line_code, (lookup.get(station.line_code) ?? 0) + 1);
    }
    return lookup;
  }, [stations]);

  async function handleCreateDepartment() {
    try {
      await createDepartment({
        code: departmentCode.trim().toUpperCase(),
        name: departmentName.trim(),
        is_active: true,
      });
      setDepartmentCode("");
      setDepartmentName("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create department.");
    }
  }

  async function handleCreateLine() {
    try {
      await createLine({
        code: lineCode.trim().toUpperCase(),
        name: lineName.trim(),
        department_code: lineDepartmentCode,
        is_active: true,
      });
      setLineCode("");
      setLineName("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create line.");
    }
  }

  async function handleCreateStation() {
    try {
      await createStation({
        code: stationCode.trim().toUpperCase(),
        name: stationName.trim(),
        line_code: stationLineCode,
        is_active: true,
      });
      setStationCode("");
      setStationName("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create station.");
    }
  }

  async function handleDeleteDepartment(code: string) {
    const approved = window.confirm(`Delete department ${code}?`);
    if (!approved) {
      return;
    }
    try {
      await deleteDepartment(code);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete department.");
    }
  }

  async function handleDeleteLine(code: string) {
    const approved = window.confirm(`Delete line ${code}?`);
    if (!approved) {
      return;
    }
    try {
      await deleteLine(code);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete line.");
    }
  }

  async function handleDeleteStation(code: string) {
    const approved = window.confirm(`Delete station ${code}?`);
    if (!approved) {
      return;
    }
    try {
      await deleteStation(code);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete station.");
    }
  }

  async function handleImportCsv() {
    if (csvValidation.errors.length > 0) {
      setError("Fix CSV validation errors before importing.");
      return;
    }

    try {
      setIsImporting(true);
      const summary = await importMasterDataCsv(importCsv);
      setImportSummary(summary);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import master CSV.");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleValidateOnly() {
    if (csvValidation.errors.length > 0) {
      setError("Fix CSV validation errors before running dry-run validation.");
      return;
    }

    try {
      setIsValidatingImport(true);
      const summary = await validateMasterDataCsv(importCsv, uploadedFileName ?? "");
      setImportSummary(summary);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate import CSV.");
    } finally {
      setIsValidatingImport(false);
    }
  }

  async function handleRollback(batchId: string) {
    const approved = window.confirm(`Rollback import batch ${batchId}?`);
    if (!approved) {
      return;
    }

    try {
      await rollbackImportBatch(batchId);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rollback import batch.");
    }
  }

  if (!canManageAssets(currentUser)) {
    return (
      <section className="page">
        <div className="page-head">
          <h2>Plant Mapping</h2>
          <p>Only users with asset permissions can manage department, line, and station mapping.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Plant Mapping</h2>
        <p>Manage department-line-station hierarchy and import master data in bulk using CSV.</p>
      </div>

      {isLoading && <p className="state-note">Loading plant mapping...</p>}
      {error && <p className="state-note error">{error}</p>}

      <div className="inline-form-card">
        <h3>Master Data Import (CSV)</h3>
        <p className="state-note">Columns: entity_type, code, name, parent_code, is_active</p>
        {!canImportMasterData(currentUser) && (
          <p className="state-note">Your role can manage mapping but cannot run import/rollback. Ask admin to grant import permission.</p>
        )}
        <div className="action-row">
          <button className="tab" type="button" onClick={downloadTemplateCsv}>
            Download CSV Template
          </button>
          <button className="tab" type="button" onClick={downloadTemplateXlsx}>
            Download XLSX Template
          </button>
          <label>
            Upload CSV/XLSX
            <input type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={handleUploadCsvFile} />
          </label>
          {uploadedFileName && <p className="state-note">Loaded file: {uploadedFileName}</p>}
        </div>
        {xlsxSheetNames.length > 1 && (
          <div className="action-row">
            <label>
              Sheet
              <select value={selectedSheetName} onChange={(e) => handleSelectSheet(e.target.value)}>
                {xlsxSheetNames.map((sheetName) => (
                  <option key={sheetName} value={sheetName}>
                    {sheetName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <textarea className="csv-textarea" value={importCsv} onChange={(e) => handleImportCsvChange(e.target.value)} rows={8} />
        {previewTable.headers.length > 0 && (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  {previewTable.headers.map((header) => (
                    <th key={header}>{header || "(blank)"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewTable.body.length === 0 && (
                  <tr>
                    <td colSpan={Math.max(1, previewTable.headers.length)}>No data rows found.</td>
                  </tr>
                )}
                {previewTable.body.map((row, idx) => (
                  <tr key={`preview-${idx + 1}`}>
                    {previewTable.headers.map((_, cellIndex) => (
                      <td key={`preview-${idx + 1}-${cellIndex}`}>{row[cellIndex] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pagination-meta">Previewing first {previewTable.body.length} row(s).</p>
          </div>
        )}
        <div className="state-note">
          Parsed rows: {csvValidation.rowCount}
          {csvValidation.errors.length > 0 ? ` | Validation errors: ${csvValidation.errors.length}` : " | Validation passed"}
        </div>
        {csvValidation.errors.length > 0 && (
          <div className="validation-card">
            <p className="state-note error">CSV validation errors (showing first 8):</p>
            <ul className="validation-list">
              {csvValidation.errors.slice(0, 8).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="action-row">
          <button
            className="tab"
            type="button"
            onClick={handleValidateOnly}
            disabled={isValidatingImport || importCsv.trim().length < 20 || csvValidation.errors.length > 0 || !canImportMasterData(currentUser)}
          >
            {isValidatingImport ? "Validating..." : "Validate Only"}
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={handleImportCsv}
            disabled={isImporting || importCsv.trim().length < 20 || csvValidation.errors.length > 0 || !canImportMasterData(currentUser)}
          >
            {isImporting ? "Importing..." : "Import CSV"}
          </button>
        </div>
        {importSummary && (
          <p className="state-note">
            Batch: {importSummary.batch_id} ({importSummary.dry_run ? "Dry-Run" : "Applied"}) | 
            Imported: departments (+{importSummary.departments_created}/{importSummary.departments_updated} updated), lines
            (+{importSummary.lines_created}/{importSummary.lines_updated} updated), stations (+{importSummary.stations_created}/
            {importSummary.stations_updated} updated), skipped {importSummary.skipped_rows}
          </p>
        )}
      </div>

      <div className="metric-grid compact">
        <article className="metric-card">
          <p className="metric-title">Orphan Lines</p>
          <p className="metric-value">{integrityReport?.orphan_lines ?? 0}</p>
          <p className="metric-hint">Lines linked to missing department</p>
        </article>
        <article className="metric-card">
          <p className="metric-title">Orphan Stations</p>
          <p className="metric-value">{integrityReport?.orphan_stations ?? 0}</p>
          <p className="metric-hint">Stations linked to missing line</p>
        </article>
        <article className="metric-card">
          <p className="metric-title">Duplicate Codes</p>
          <p className="metric-value">
            {(integrityReport?.duplicate_department_codes ?? 0) +
              (integrityReport?.duplicate_line_codes ?? 0) +
              (integrityReport?.duplicate_station_codes ?? 0)}
          </p>
          <p className="metric-hint">Duplicate codes across mapping tables</p>
        </article>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Batch</th>
              <th>When</th>
              <th>Actor</th>
              <th>Source</th>
              <th>Mode</th>
              <th>Rollback</th>
            </tr>
          </thead>
          <tbody>
            {importHistory.slice(0, 10).map((item) => (
              <tr key={item.batch_id}>
                <td>{item.batch_id}</td>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>{item.actor_email}</td>
                <td>{item.source_file_name || "manual"}</td>
                <td>{item.dry_run ? "Dry-Run" : "Applied"}</td>
                <td>
                  <button
                    className="tab"
                    type="button"
                    onClick={() => handleRollback(item.batch_id)}
                    disabled={item.dry_run || item.rollback_applied || !canImportMasterData(currentUser)}
                  >
                    {item.rollback_applied ? "Rolled Back" : "Rollback"}
                  </button>
                </td>
              </tr>
            ))}
            {importHistory.length === 0 && (
              <tr>
                <td colSpan={6}>No import history found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="inline-form-card">
        <h3>Create Department</h3>
        <div className="inline-form-grid">
          <label>
            Code
            <input value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value)} placeholder="FRAME" />
          </label>
          <label>
            Name
            <input value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="Frame Manufacturing" />
          </label>
        </div>
        <button className="primary-btn" type="button" onClick={handleCreateDepartment} disabled={!departmentCode.trim() || !departmentName.trim()}>
          Add Department
        </button>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Lines</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((item) => (
              <tr key={item.code}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td>{linesByDepartment.get(item.code) ?? 0}</td>
                <td>{item.is_active ? "Yes" : "No"}</td>
                <td>
                  <button className="tab" type="button" onClick={() => handleDeleteDepartment(item.code)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && departments.length === 0 && (
              <tr>
                <td colSpan={5}>No departments found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="inline-form-card">
        <h3>Create Line</h3>
        <div className="inline-form-grid">
          <label>
            Code
            <input value={lineCode} onChange={(e) => setLineCode(e.target.value)} placeholder="FRM-L2" />
          </label>
          <label>
            Name
            <input value={lineName} onChange={(e) => setLineName(e.target.value)} placeholder="Frame Line 2" />
          </label>
          <label>
            Department
            <select value={lineDepartmentCode} onChange={(e) => setLineDepartmentCode(e.target.value)}>
              {departments.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} - {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="primary-btn"
          type="button"
          onClick={handleCreateLine}
          disabled={!lineCode.trim() || !lineName.trim() || !lineDepartmentCode}
        >
          Add Line
        </button>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Department</th>
              <th>Stations</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((item) => (
              <tr key={item.code}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td>{item.department_code}</td>
                <td>{stationsByLine.get(item.code) ?? 0}</td>
                <td>{item.is_active ? "Yes" : "No"}</td>
                <td>
                  <button className="tab" type="button" onClick={() => handleDeleteLine(item.code)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && lines.length === 0 && (
              <tr>
                <td colSpan={6}>No lines found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="inline-form-card">
        <h3>Create Station</h3>
        <div className="inline-form-grid">
          <label>
            Code
            <input value={stationCode} onChange={(e) => setStationCode(e.target.value)} placeholder="ST-FRM-02" />
          </label>
          <label>
            Name
            <input value={stationName} onChange={(e) => setStationName(e.target.value)} placeholder="Frame Alignment Station" />
          </label>
          <label>
            Line
            <select value={stationLineCode} onChange={(e) => setStationLineCode(e.target.value)}>
              {lines.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} - {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="primary-btn"
          type="button"
          onClick={handleCreateStation}
          disabled={!stationCode.trim() || !stationName.trim() || !stationLineCode}
        >
          Add Station
        </button>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Line</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((item) => (
              <tr key={item.code}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td>{item.line_code}</td>
                <td>{item.is_active ? "Yes" : "No"}</td>
                <td>
                  <button className="tab" type="button" onClick={() => handleDeleteStation(item.code)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && stations.length === 0 && (
              <tr>
                <td colSpan={5}>No stations found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
