import type { AuthUser } from "../lib/types";
import {
  ConsumePartModal,
  EditWorkOrderModal,
  WorkOrderCreateForm,
  WorkOrdersActionsBar,
  WorkOrdersFiltersBar,
  WorkOrdersPagination,
  WorkOrdersTable,
} from "../features/work-orders/components";
import { useWorkOrdersPageState } from "../features/work-orders/hooks/useWorkOrdersPageState";

type WorkOrdersPageProps = {
  currentUser: AuthUser;
};

export function WorkOrdersPage({ currentUser }: WorkOrdersPageProps) {
  const {
    workOrders,
    machines,
    page,
    totalPages,
    totalItems,
    isLoading,
    error,
    canCreate,
    canUpdate,
    showCreateForm,
    setShowCreateForm,
    isCreating,
    isAutoGenerating,
    workOrderCode,
    setWorkOrderCode,
    machineId,
    setMachineId,
    status,
    setStatus,
    priority,
    setPriority,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    editingWorkOrder,
    openEditModal,
    closeEditModal,
    editStatus,
    setEditStatus,
    editPriority,
    setEditPriority,
    isSavingEdit,
    consumptionWorkOrder,
    openConsumeModal,
    closeConsumeModal,
    spareParts,
    consumptions,
    consumePartId,
    setConsumePartId,
    consumeQuantity,
    setConsumeQuantity,
    consumeNotes,
    setConsumeNotes,
    isConsumingPart,
    isLoadingConsumption,
    loadWorkOrders,
    createWorkOrderAction,
    autoGenerateAction,
    saveEditAction,
    deleteOrderAction,
    exportCsvAction,
    exportPdfAction,
    consumePartAction,
  } = useWorkOrdersPageState({ currentUser });

  return (
    <section className="page">
      <div className="page-head">
        <h2>Work Orders</h2>
        <p>Execution queue for technicians with clear priority and status controls.</p>
      </div>

      <WorkOrdersActionsBar
        canCreate={canCreate}
        showCreateForm={showCreateForm}
        onToggleCreateForm={() => setShowCreateForm((prev) => !prev)}
        onExportCsv={exportCsvAction}
        onExportPdf={exportPdfAction}
        onAutoGenerate={autoGenerateAction}
        isAutoGenerating={isAutoGenerating}
      />

      <WorkOrdersFiltersBar
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
      />

      {showCreateForm && canCreate && (
        <WorkOrderCreateForm
          machines={machines}
          workOrderCode={workOrderCode}
          onWorkOrderCodeChange={setWorkOrderCode}
          machineId={machineId}
          onMachineIdChange={setMachineId}
          status={status}
          onStatusChange={setStatus}
          priority={priority}
          onPriorityChange={setPriority}
          isCreating={isCreating}
          onCreate={createWorkOrderAction}
        />
      )}

      {!canUpdate && (
        <p className="state-note">Your role has read-only access to work orders.</p>
      )}

      {isLoading && <p className="state-note">Loading work orders...</p>}
      {error && <p className="state-note error">{error}</p>}

      <WorkOrdersTable
        workOrders={workOrders}
        isLoading={isLoading}
        canUpdate={canUpdate}
        canCreate={canCreate}
        onEdit={openEditModal}
        onConsume={openConsumeModal}
        onDelete={deleteOrderAction}
      />

      <WorkOrdersPagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        onPrev={() => loadWorkOrders(page - 1)}
        onNext={() => loadWorkOrders(page + 1)}
      />

      <EditWorkOrderModal
        editingWorkOrder={editingWorkOrder}
        editStatus={editStatus}
        onEditStatusChange={setEditStatus}
        editPriority={editPriority}
        onEditPriorityChange={setEditPriority}
        onClose={closeEditModal}
        onSave={saveEditAction}
        isSaving={isSavingEdit}
      />

      <ConsumePartModal
        consumptionWorkOrder={consumptionWorkOrder}
        onClose={closeConsumeModal}
        onConsume={consumePartAction}
        isConsumingPart={isConsumingPart}
        consumePartId={consumePartId}
        onConsumePartIdChange={setConsumePartId}
        consumeQuantity={consumeQuantity}
        onConsumeQuantityChange={setConsumeQuantity}
        consumeNotes={consumeNotes}
        onConsumeNotesChange={setConsumeNotes}
        spareParts={spareParts}
        isLoadingConsumption={isLoadingConsumption}
        consumptions={consumptions}
      />
    </section>
  );
}
