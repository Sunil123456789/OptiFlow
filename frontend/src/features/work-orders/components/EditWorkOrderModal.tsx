import { Modal } from "../../../components/Modal";
import type { WorkOrder } from "../../../lib/types";
import type { WorkOrderPriority, WorkOrderStatus } from "../types";

type EditWorkOrderModalProps = {
  editingWorkOrder: WorkOrder | null;
  editStatus: WorkOrderStatus;
  onEditStatusChange: (value: WorkOrderStatus) => void;
  editPriority: WorkOrderPriority;
  onEditPriorityChange: (value: WorkOrderPriority) => void;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
};

export function EditWorkOrderModal({
  editingWorkOrder,
  editStatus,
  onEditStatusChange,
  editPriority,
  onEditPriorityChange,
  onClose,
  onSave,
  isSaving,
}: EditWorkOrderModalProps) {
  return (
    <Modal
      open={editingWorkOrder !== null}
      title={editingWorkOrder ? `Edit ${editingWorkOrder.work_order_code}` : "Edit Work Order"}
      onClose={onClose}
      actions={
        <>
          <button className="tab" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </>
      }
    >
      <div className="inline-form-grid">
        <label>
          Status
          <select value={editStatus} onChange={(e) => onEditStatusChange(e.target.value as WorkOrderStatus)}>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Priority
          <select value={editPriority} onChange={(e) => onEditPriorityChange(e.target.value as WorkOrderPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}
