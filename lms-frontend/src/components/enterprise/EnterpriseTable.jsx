import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronUp, ChevronDown, Search, ChevronsLeft, ChevronLeft,
  ChevronRight, ChevronsRight, Inbox,
} from "lucide-react";

/* =========================================================================
 * <EnterpriseTable />  — premium responsive data-table with:
 *   · search across all string columns
 *   · column sort (asc / desc)
 *   · pagination (page-size selector)
 *   · empty state
 *   · render(value, row) per-column formatter
 *
 * Props:
 *   columns: [{ key, label, sortable?: bool, render?: fn, className?: string }]
 *   rows:    [{ ... }]
 *   searchable?: boolean        (default true)
 *   pageSize?: number           (default 10)
 *   stickyHeader?: boolean      (default true)
 *   emptyText?: string
 * ======================================================================= */
const EnterpriseTable = ({
  columns,
  rows = [],
  searchable = true,
  pageSize: initialPageSize = 10,
  stickyHeader = true,
  emptyText = "No records found",
  toolbar = null,
}) => {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  /* ----- filter + sort pipeline (memoised) ----- */
  const processed = useMemo(() => {
    let out = rows;
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((r) =>
        columns.some((c) => {
          const v = r[c.key];
          if (v == null) return false;
          return String(v).toLowerCase().includes(q);
        })
      );
    }
    if (sort.key) {
      out = [...out].sort((a, b) => {
        const av = a[sort.key]; const bv = b[sort.key];
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number")
          return sort.dir === "asc" ? av - bv : bv - av;
        return sort.dir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }
    return out;
  }, [rows, columns, query, sort]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const visible = processed.slice(start, start + pageSize);

  const handleSort = (key, sortable) => {
    if (sortable === false) return;
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  return (
    <div className="card-base overflow-hidden">
      {/* Toolbar */}
      {(searchable || toolbar) && (
        <div className="px-4 py-3 border-b border-app flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          {searchable ? (
            <div className="relative w-full sm:max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Search records…"
                className="input-base pl-9 py-2 text-sm"
              />
            </div>
          ) : <div />}
          {toolbar && <div className="flex flex-wrap gap-2">{toolbar}</div>}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={`${stickyHeader ? "sticky top-0" : ""} bg-slate-50 dark:bg-slate-900/80 backdrop-blur z-10`}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key, col.sortable)}
                  className={`text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-app whitespace-nowrap select-none ${
                    col.sortable !== false ? "cursor-pointer hover:text-primary-600 dark:hover:text-primary-400" : ""
                  } ${col.className || ""}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && sort.key === col.key && (
                      sort.dir === "asc"
                        ? <ChevronUp size={12} />
                        : <ChevronDown size={12} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-16 text-center">
                  <Inbox size={40} className="mx-auto text-slate-300 dark:text-slate-700" />
                  <p className="text-sm text-muted-app mt-2">{emptyText}</p>
                </td>
              </tr>
            ) : (
              visible.map((row, idx) => (
                <motion.tr
                  key={row.id ?? idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.015 }}
                  className="border-b border-app last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-app whitespace-nowrap ${col.cellClassName || ""}`}
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {processed.length > 0 && (
        <div className="px-4 py-3 border-t border-app flex flex-col sm:flex-row gap-2 items-center justify-between text-xs text-muted-app">
          <div className="flex items-center gap-2">
            <span>Showing <b className="text-app">{start + 1}</b>–<b className="text-app">{Math.min(start + pageSize, processed.length)}</b> of <b className="text-app">{processed.length}</b></span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="input-base py-1 px-2 text-xs"
            >
              {[5, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)}              disabled={safePage === 1}          className="p-1.5 rounded-lg border border-app disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronsLeft size={14} /></button>
            <button onClick={() => setPage(safePage - 1)}   disabled={safePage === 1}          className="p-1.5 rounded-lg border border-app disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={14} /></button>
            <span className="px-3 font-bold text-app">{safePage} / {totalPages}</span>
            <button onClick={() => setPage(safePage + 1)}   disabled={safePage === totalPages} className="p-1.5 rounded-lg border border-app disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={14} /></button>
            <button onClick={() => setPage(totalPages)}     disabled={safePage === totalPages} className="p-1.5 rounded-lg border border-app disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronsRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnterpriseTable;
