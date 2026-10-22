import { ChevronLeft, ChevronRight } from "lucide-react";
export const Pagination = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  labelSingular = "item",
  labelPlural = "items"
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, "...", totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, "...", totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "...", currentPage, "...", totalPages);
      }
    }
    return pages;
  };
  return <div className="p-3.5 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
      <div className="flex items-center gap-3">
        {onPageSizeChange && <div className="flex items-center gap-1.5">
            <span className="whitespace-nowrap">Rows per page:</span>
            <select
    value={pageSize}
    onChange={(e) => onPageSizeChange(Number(e.target.value))}
    className="h-7 pl-2 pr-6 bg-white border border-slate-200 text-slate-800 rounded font-medium focus:outline-none focus:ring-1 focus:ring-[#0f2922]"
  >
              {pageSizeOptions.map((opt) => <option key={opt} value={opt}>
                  {opt}
                </option>)}
            </select>
            <span className="text-slate-300">|</span>
          </div>}
        <span className="whitespace-nowrap">
          Showing <strong className="text-slate-900 font-semibold">{startItem}–{endItem}</strong> of{" "}
          <strong className="text-slate-900 font-semibold">{totalItems}</strong>{" "}
          {totalItems === 1 ? labelSingular : labelPlural}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
    type="button"
    disabled={currentPage <= 1}
    onClick={() => onPageChange(currentPage - 1)}
    className="h-7 px-2.5 rounded bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium shadow-xs"
  >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {getPageNumbers().map((p, idx) => {
    if (p === "...") {
      return <span key={`dots-${idx}`} className="px-1.5 text-slate-400 select-none">
                ...
              </span>;
    }
    const isCurrent = p === currentPage;
    return <button
      key={`page-${p}`}
      type="button"
      onClick={() => onPageChange(Number(p))}
      className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${isCurrent ? "bg-[#0f2922] text-white shadow-xs" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"}`}
    >
              {p}
            </button>;
  })}

        <button
    type="button"
    disabled={currentPage >= totalPages}
    onClick={() => onPageChange(currentPage + 1)}
    className="h-7 px-2.5 rounded bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium shadow-xs"
  >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>;
};
