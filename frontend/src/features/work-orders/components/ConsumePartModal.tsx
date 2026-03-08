import { Modal } from "../../../components/Modal";
import type { SparePart, WorkOrder, WorkOrderPartConsumption } from "../../../lib/types";

type ConsumePartModalProps = {
  consumptionWorkOrder: WorkOrder | null;
  onClose: () => void;
  onConsume: () => void;
  isConsumingPart: boolean;
  consumePartId: number;
  onConsumePartIdChange: (value: number) => void;
  consumeQuantity: string;
  onConsumeQuantityChange: (value: string) => void;
  consumeNotes: string;
  onConsumeNotesChange: (value: string) => void;
  spareParts: SparePart[];
  isLoadingConsumption: boolean;
  consumptions: WorkOrderPartConsumption[];
};

export function ConsumePartModal({
  consumptionWorkOrder,
  onClose,
  onConsume,
  isConsumingPart,
  consumePartId,
  onConsumePartIdChange,
  consumeQuantity,
  onConsumeQuantityChange,
  consumeNotes,
  onConsumeNotesChange,
  spareParts,
  isLoadingConsumption,
  consumptions,
}: ConsumePartModalProps) {
  return (
    <Modal
      open={consumptionWorkOrder !== null}
      title={consumptionWorkOrder ? `Consume Parts - ${consumptionWorkOrder.work_order_code}` : "Consume Parts"}
      onClose={onClose}
      actions={
        <>
          <button className="tab" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={onConsume}
            disabled={isConsumingPart || consumePartId <= 0 || Number(consumeQuantity) <= 0}
          >
            {isConsumingPart ? "Saving..." : "Consume"}
          </button>
        </>
      }
    >
      <div className="inline-form-grid">
        <label>
          Spare Part
          <select value={consumePartId} onChange={(e) => onConsumePartIdChange(Number(e.target.value))}>
            {spareParts.map((part) => (
              <option key={part.id} value={part.id}>
                {part.part_code} - {part.name} (Stock: {part.stock_qty})
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input type="number" min={1} step={1} value={consumeQuantity} onChange={(e) => onConsumeQuantityChange(e.target.value)} />
        </label>
        <label>
          Notes
          <input value={consumeNotes} onChange={(e) => onConsumeNotesChange(e.target.value)} placeholder="Optional note" />
        </label>
      </div>

      {isLoadingConsumption && <p className="state-note">Loading consumption history...</p>}
      {!isLoadingConsumption && (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>Qty</th>
                <th>Unit Cost</th>
                <th>Total</th>
                <th>By</th>
                <th>At</th>
              </tr>
            </thead>
            <tbody>
              {consumptions.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.part_code} - {item.part_name}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{item.unit_cost.toFixed(2)}</td>
                  <td>{item.total_cost.toFixed(2)}</td>
                  <td>{item.consumed_by}</td>
                  <td>{new Date(item.consumed_at).toLocaleString()}</td>
                </tr>
              ))}
              {consumptions.length === 0 && (
                <tr>
                  <td colSpan={6}>No parts consumed yet for this work order.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
