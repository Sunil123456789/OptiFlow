import type { Machine } from "../../../lib/types";
import type { WorkOrderPriority, WorkOrderStatus } from "../types";

type WorkOrderCreateFormProps = {
  machines: Machine[];
  workOrderCode: string;
  onWorkOrderCodeChange: (value: string) => void;
  machineId: number;
  onMachineIdChange: (value: number) => void;
  status: WorkOrderStatus;
  onStatusChange: (value: WorkOrderStatus) => void;
  priority: WorkOrderPriority;
  onPriorityChange: (value: WorkOrderPriority) => void;
  isCreating: boolean;
  onCreate: () => void;
};

export function WorkOrderCreateForm({
  machines,
  workOrderCode,
  onWorkOrderCodeChange,
  machineId,
  onMachineIdChange,
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  isCreating,
  onCreate,
}: WorkOrderCreateFormProps) {
  return (
    <div className="inline-form-card">
      <h3>Create Work Order</h3>
      <div className="inline-form-grid">
        <label>
          Work Order Code
          <input value={workOrderCode} onChange={(e) => onWorkOrderCodeChange(e.target.value)} placeholder="WO-NEW-001" />
        </label>
        <label>
          Machine
          <select value={machineId} onChange={(e) => onMachineIdChange(Number(e.target.value))}>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.machine_code} - {machine.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => onStatusChange(e.target.value as WorkOrderStatus)}>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => onPriorityChange(e.target.value as WorkOrderPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
      </div>
      <button className="primary-btn" type="button" onClick={onCreate} disabled={isCreating || !workOrderCode.trim() || machines.length === 0}>
        {isCreating ? "Creating..." : "Save Work Order"}
      </button>
    </div>
  );
}
