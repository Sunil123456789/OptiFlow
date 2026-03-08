import { useEffect, useMemo, useState } from "react";

import { Modal } from "../../../components/Modal";
import {
  createSparePart,
  deleteSparePart,
  exportSpareParts,
  fetchSparePartsWithOptions,
  updateSparePart,
} from "../../../lib/api";
import { exportToCsv, exportToPdfLikePrint } from "../../../lib/exporters";
import { canManageAssets } from "../../../lib/permissions";
import type { AuthUser, SparePart } from "../../../lib/types";

type SparePartsPageProps = {
  currentUser: AuthUser;
};

export function SparePartsPage({ currentUser }: SparePartsPageProps) {
  const [parts, setParts] = useState<SparePart[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"part_code" | "name" | "category" | "stock_qty" | "reorder_level" | "unit_cost" | "is_active">("part_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [newPartCode, setNewPartCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Mechanical");
  const [newStockQty, setNewStockQty] = useState("0");
  const [newReorderLevel, setNewReorderLevel] = useState("0");
  const [newUnitCost, setNewUnitCost] = useState("0");
  const [newIsActive, setNewIsActive] = useState(true);

  const [editingPart, setEditingPart] = useState<SparePart | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("Mechanical");
  const [editStockQty, setEditStockQty] = useState("0");
  const [editReorderLevel, setEditReorderLevel] = useState("0");
  const [editUnitCost, setEditUnitCost] = useState("0");
  const [editIsActive, setEditIsActive] = useState(true);

  const lowStockCount = useMemo(
    () => parts.filter((part) => part.is_active && part.stock_qty <= part.reorder_level).length,
    [parts]
  );

  async function loadParts(targetPage = page) {
    try {
      setIsLoading(true);
      const data = await fetchSparePartsWithOptions(targetPage, pageSize, {
        q: query,
        lowStockOnly,
        sortBy,
        sortDir,
      });
      setParts(data.items);
      setPage(data.pagination.page);
      setTotalPages(data.pagination.total_pages);
      setTotalItems(data.pagination.total);
      setError(null);
    } catch {
      setError("Could not load spare parts from backend.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadParts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadParts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, lowStockOnly, sortBy, sortDir]);

  async function handleCreatePart() {
    try {
      setIsCreating(true);
      await createSparePart({
        part_code: newPartCode.trim(),
        name: newName.trim(),
        category: newCategory.trim(),
        stock_qty: Number(newStockQty),
        reorder_level: Number(newReorderLevel),
        unit_cost: Number(newUnitCost),
        is_active: newIsActive,
      });
      setShowCreateForm(false);
      setNewPartCode("");
      setNewName("");
      setNewCategory("Mechanical");
      setNewStockQty("0");
      setNewReorderLevel("0");
      setNewUnitCost("0");
      setNewIsActive(true);
      await loadParts(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create spare part.");
    } finally {
      setIsCreating(false);
    }
  }

  function openEditModal(part: SparePart) {
    setEditingPart(part);
    setEditName(part.name);
    setEditCategory(part.category);
    setEditStockQty(String(part.stock_qty));
    setEditReorderLevel(String(part.reorder_level));
    setEditUnitCost(String(part.unit_cost));
    setEditIsActive(part.is_active);
  }

  function closeEditModal() {
    setEditingPart(null);
    setEditName("");
    setEditCategory("Mechanical");
    setEditStockQty("0");
    setEditReorderLevel("0");
    setEditUnitCost("0");
    setEditIsActive(true);
  }

  async function handleSaveEditPart() {
    if (!editingPart || !editName.trim()) {
      return;
    }

    try {
      setIsSavingEdit(true);
      await updateSparePart(editingPart.id, {
        name: editName.trim(),
        category: editCategory.trim(),
        stock_qty: Number(editStockQty),
        reorder_level: Number(editReorderLevel),
        unit_cost: Number(editUnitCost),
        is_active: editIsActive,
      });
      closeEditModal();
      await loadParts(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update spare part.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeletePart(part: SparePart) {
    const approved = window.confirm(`Delete ${part.part_code} (${part.name})?`);
    if (!approved) {
      return;
    }

    try {
      await deleteSparePart(part.id);
      await loadParts(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete spare part.");
    }
  }

  async function handleExportCsv() {
    try {
      const data = await exportSpareParts({ q: query, lowStockOnly, sortBy, sortDir });
      exportToCsv(
        "spare_parts_export.csv",
        ["ID", "Part Code", "Name", "Category", "Stock Qty", "Reorder Level", "Unit Cost", "Active"],
        data.map((part) => [
          part.id,
          part.part_code,
          part.name,
          part.category,
          part.stock_qty,
          part.reorder_level,
          part.unit_cost,
          part.is_active ? "Yes" : "No",
        ])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export spare parts.");
    }
  }

  async function handleExportPdf() {
    try {
      const data = await exportSpareParts({ q: query, lowStockOnly, sortBy, sortDir });
      exportToPdfLikePrint(
        "Spare Parts Export",
        ["ID", "Part Code", "Name", "Category", "Stock Qty", "Reorder Level", "Unit Cost", "Active"],
        data.map((part) => [
          part.id,
          part.part_code,
          part.name,
          part.category,
          part.stock_qty,
          part.reorder_level,
          part.unit_cost,
          part.is_active ? "Yes" : "No",
        ])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export spare parts.");
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Spare Parts Inventory</h2>
        <p>Maintain minimum stock thresholds and prepare for low-stock replenishment workflows.</p>
      </div>

      <div className="metric-grid compact">
        <article className="metric-card">
          <p className="metric-title">Low Stock in Current View</p>
          <p className="metric-value">{lowStockCount}</p>
          <p className="metric-hint">Parts at or below reorder level</p>
        </article>
      </div>

      <div className="action-row">
        <button
          className="primary-btn"
          type="button"
          disabled={!canManageAssets(currentUser)}
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          Add Spare Part
        </button>
        <button className="tab" type="button" onClick={handleExportCsv}>
          Export CSV
        </button>
        <button className="tab" type="button" onClick={handleExportPdf}>
          Export PDF
        </button>
        {!canManageAssets(currentUser) && (
          <p className="state-note">Only admin or maintenance manager can manage spare parts.</p>
        )}
      </div>

      <div className="action-row">
        <input
          className="search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search code, name, category"
        />
        <label>
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(event) => setLowStockOnly(event.target.checked)}
          />
          Low stock only
        </label>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
          <option value="part_code">Sort: Part Code</option>
          <option value="name">Sort: Name</option>
          <option value="category">Sort: Category</option>
          <option value="stock_qty">Sort: Stock Qty</option>
          <option value="reorder_level">Sort: Reorder Level</option>
          <option value="unit_cost">Sort: Unit Cost</option>
          <option value="is_active">Sort: Active</option>
        </select>
        <select value={sortDir} onChange={(event) => setSortDir(event.target.value as typeof sortDir)}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>

      {showCreateForm && canManageAssets(currentUser) && (
        <div className="inline-form-card">
          <h3>Create Spare Part</h3>
          <div className="inline-form-grid">
            <label>
              Part Code
              <input value={newPartCode} onChange={(event) => setNewPartCode(event.target.value)} placeholder="SP-NEW-001" />
            </label>
            <label>
              Name
              <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Bearing 6206" />
            </label>
            <label>
              Category
              <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Mechanical" />
            </label>
            <label>
              Stock Qty
              <input type="number" min={0} value={newStockQty} onChange={(event) => setNewStockQty(event.target.value)} />
            </label>
            <label>
              Reorder Level
              <input
                type="number"
                min={0}
                value={newReorderLevel}
                onChange={(event) => setNewReorderLevel(event.target.value)}
              />
            </label>
            <label>
              Unit Cost
              <input type="number" min={0} step="0.01" value={newUnitCost} onChange={(event) => setNewUnitCost(event.target.value)} />
            </label>
            <label>
              Active
              <select value={newIsActive ? "yes" : "no"} onChange={(event) => setNewIsActive(event.target.value === "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
          <button
            className="primary-btn"
            type="button"
            onClick={handleCreatePart}
            disabled={isCreating || !newPartCode.trim() || !newName.trim()}
          >
            {isCreating ? "Creating..." : "Save Spare Part"}
          </button>
        </div>
      )}

      {isLoading && <p className="state-note">Loading spare parts...</p>}
      {error && <p className="state-note error">{error}</p>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Part Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Reorder</th>
              <th>Unit Cost</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => (
              <tr key={part.id}>
                <td>{part.id}</td>
                <td>{part.part_code}</td>
                <td>{part.name}</td>
                <td>{part.category}</td>
                <td>{part.stock_qty}</td>
                <td>{part.reorder_level}</td>
                <td>{part.unit_cost.toFixed(2)}</td>
                <td>{part.is_active ? "Yes" : "No"}</td>
                <td>
                  <div className="row-actions">
                    <button className="tab" type="button" onClick={() => openEditModal(part)} disabled={!canManageAssets(currentUser)}>
                      Edit
                    </button>
                    <button
                      className="tab"
                      type="button"
                      onClick={() => handleDeletePart(part)}
                      disabled={!canManageAssets(currentUser)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && parts.length === 0 && (
              <tr>
                <td colSpan={9}>No spare parts found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <button className="tab" type="button" disabled={page <= 1} onClick={() => loadParts(page - 1)}>
          Prev
        </button>
        <button className="tab" type="button" disabled={page >= totalPages} onClick={() => loadParts(page + 1)}>
          Next
        </button>
        <p className="pagination-meta">
          Page {page} of {totalPages} | Total parts: {totalItems}
        </p>
      </div>

      <Modal
        open={editingPart !== null}
        title={editingPart ? `Edit ${editingPart.part_code}` : "Edit Spare Part"}
        onClose={closeEditModal}
        actions={
          <>
            <button className="tab" type="button" onClick={closeEditModal}>
              Cancel
            </button>
            <button className="primary-btn" type="button" onClick={handleSaveEditPart} disabled={isSavingEdit || !editName.trim()}>
              {isSavingEdit ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="inline-form-grid">
          <label>
            Name
            <input value={editName} onChange={(event) => setEditName(event.target.value)} />
          </label>
          <label>
            Category
            <input value={editCategory} onChange={(event) => setEditCategory(event.target.value)} />
          </label>
          <label>
            Stock Qty
            <input type="number" min={0} value={editStockQty} onChange={(event) => setEditStockQty(event.target.value)} />
          </label>
          <label>
            Reorder Level
            <input
              type="number"
              min={0}
              value={editReorderLevel}
              onChange={(event) => setEditReorderLevel(event.target.value)}
            />
          </label>
          <label>
            Unit Cost
            <input type="number" min={0} step="0.01" value={editUnitCost} onChange={(event) => setEditUnitCost(event.target.value)} />
          </label>
          <label>
            Active
            <select value={editIsActive ? "yes" : "no"} onChange={(event) => setEditIsActive(event.target.value === "yes")}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
      </Modal>
    </section>
  );
}

