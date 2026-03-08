type WorkOrdersActionsBarProps = {
  canCreate: boolean;
  showCreateForm: boolean;
  onToggleCreateForm: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onAutoGenerate: () => void;
  isAutoGenerating: boolean;
};

export function WorkOrdersActionsBar({
  canCreate,
  showCreateForm,
  onToggleCreateForm,
  onExportCsv,
  onExportPdf,
  onAutoGenerate,
  isAutoGenerating,
}: WorkOrdersActionsBarProps) {
  return (
    <div className="action-row">
      <button className="primary-btn" type="button" disabled={!canCreate} onClick={onToggleCreateForm}>
        {showCreateForm ? "Close Form" : "Create Work Order"}
      </button>
      <button className="tab" type="button" onClick={onExportCsv}>
        Export CSV
      </button>
      <button className="tab" type="button" onClick={onExportPdf}>
        Export PDF
      </button>
      <button className="tab" type="button" onClick={onAutoGenerate} disabled={!canCreate || isAutoGenerating}>
        {isAutoGenerating ? "Generating..." : "Auto-Generate From Due Plans"}
      </button>
      {!canCreate && <p className="state-note">Only admin or maintenance manager can create work orders.</p>}
    </div>
  );
}
