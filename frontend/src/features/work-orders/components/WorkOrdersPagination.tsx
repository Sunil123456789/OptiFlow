type WorkOrdersPaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  onPrev: () => void;
  onNext: () => void;
};

export function WorkOrdersPagination({ page, totalPages, totalItems, onPrev, onNext }: WorkOrdersPaginationProps) {
  return (
    <div className="pagination-row">
      <button className="tab" type="button" disabled={page <= 1} onClick={onPrev}>
        Prev
      </button>
      <button className="tab" type="button" disabled={page >= totalPages} onClick={onNext}>
        Next
      </button>
      <p className="pagination-meta">
        Page {page} of {totalPages} | Total work orders: {totalItems}
      </p>
    </div>
  );
}
