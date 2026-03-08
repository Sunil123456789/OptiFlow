import type { WorkOrder } from "../../../lib/types";
import { toLabel } from "../utils";

type WorkOrdersTableProps = {
  workOrders: WorkOrder[];
  isLoading: boolean;
  canUpdate: boolean;
  canCreate: boolean;
  onEdit: (workOrder: WorkOrder) => void;
  onConsume: (workOrder: WorkOrder) => void;
  onDelete: (workOrder: WorkOrder) => void;
};

export function WorkOrdersTable({
  workOrders,
  isLoading,
  canUpdate,
  canCreate,
  onEdit,
  onConsume,
  onDelete,
}: WorkOrdersTableProps) {
  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Code</th>
            <th>Machine</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {workOrders.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.work_order_code}</td>
              <td>{row.machine_name}</td>
              <td>{toLabel(row.status)}</td>
              <td>{toLabel(row.priority)}</td>
              <td>
                <div className="row-actions">
                  <button className="tab" type="button" onClick={() => onEdit(row)} disabled={!canUpdate}>
                    Edit
                  </button>
                  <button className="tab" type="button" onClick={() => onConsume(row)} disabled={!canUpdate}>
                    Consume Part
                  </button>
                  <button className="tab" type="button" onClick={() => onDelete(row)} disabled={!canCreate}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!isLoading && workOrders.length === 0 && (
            <tr>
              <td colSpan={6}>No work orders found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
