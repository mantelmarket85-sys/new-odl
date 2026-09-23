// ============================================================
//  SUPER ADMIN — DATA TABLE
//  Reusable enterprise table with client-side search, column
//  sorting, optional filter dropdowns, pagination footer, and
//  CSV / Excel / PDF export. Skeleton loading (no spinners).
// ============================================================
import React, { useMemo, useState } from 'react';
import { EmptyState } from './ui';
import { exportCsv, exportExcel, exportPdf } from '../utils/exporters';

const DataTable = ({
  columns, rows, loading, searchable = true, searchKeys,
  pagination, onPageChange, exportName, exportTitle, emptyText,
  toolbarExtra, filters, defaultSort,
}) => {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(defaultSort || null); // { key, dir }
  const [exportOpen, setExportOpen] = useState(false);

  const filtered = useMemo(() => {
    let data = rows || [];
    if (query.trim() && searchable) {
      const q = query.toLowerCase();
      const keys = searchKeys || (columns || []).map((c) => c.key);
      data = data.filter((r) => keys.some((k) => String(r[k] ?? '').toLowerCase().includes(q)));
    }
    if (sort && sort.key) {
      const col = columns.find((c) => c.key === sort.key);
      const getv = (r) => (col && col.exportValue ? col.exportValue(r) : r[sort.key]);
      data = [...data].sort((a, b) => {
        const av = getv(a), bv = getv(b);
        const an = Number(av), bn = Number(bv);
        let cmp;
        if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== '' && bv !== '') cmp = an - bn;
        else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        return sort.dir === 'desc' ? -cmp : cmp;
      });
    }
    return data;
  }, [rows, query, columns, searchKeys, searchable, sort]);

  const toggleSort = (key, sortable) => {
    if (sortable === false) return;
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const doExport = (fmt) => {
    setExportOpen(false);
    if (fmt === 'csv') exportCsv(columns, filtered, exportName);
    else if (fmt === 'excel') exportExcel(columns, filtered, exportName, exportTitle);
    else if (fmt === 'pdf') exportPdf(columns, filtered, exportName, exportTitle);
  };

  return (
    <div>
      {(searchable || exportName || toolbarExtra || filters) && (
        <div className="sa-toolbar">
          {searchable && (
            <div className="sa-search">
              <i className="fas fa-magnifying-glass" />
              <input className="sa-input" placeholder="Search…" value={query}
                onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}
          {filters}
          {toolbarExtra}
          <div style={{ flex: 1 }} />
          {exportName && (
            <div className="sa-export" style={{ position: 'relative' }}>
              <button className="sa-btn sa-btn-ghost" onClick={() => setExportOpen((o) => !o)}
                disabled={loading || !filtered.length}>
                <i className="fas fa-download" /> Export <i className="fas fa-chevron-down" style={{ fontSize: 10, marginLeft: 2 }} />
              </button>
              {exportOpen && (
                <div className="sa-export-menu">
                  <button onClick={() => doExport('csv')}><i className="fas fa-file-csv" /> CSV</button>
                  <button onClick={() => doExport('excel')}><i className="fas fa-file-excel" /> Excel</button>
                  <button onClick={() => doExport('pdf')}><i className="fas fa-file-pdf" /> PDF</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="sa-card">
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{ ...c.thStyle, cursor: c.sortable === false ? 'default' : 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort(c.key, c.sortable)}>
                    {c.header}
                    {sort && sort.key === c.key && (
                      <i className={`fas fa-sort-${sort.dir === 'asc' ? 'up' : 'down'}`} style={{ marginLeft: 6, fontSize: 11 }} />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, r) => (
                  <tr key={r}>{columns.map((c) => <td key={c.key}><div className="sa-skel" style={{ height: 14 }} /></td>)}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={columns.length}><EmptyState text={emptyText || 'No records match your search.'} /></td></tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={r.id ?? i}>
                    {columns.map((c) => (
                      <td key={c.key} style={c.tdStyle}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="sa-pagination">
            <span>Page {pagination.page} of {pagination.pages} · {pagination.total} records</span>
            <div className="pgs">
              <button className="sa-pg-btn" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>
                <i className="fas fa-chevron-left" />
              </button>
              <button className="sa-pg-btn active">{pagination.page}</button>
              <button className="sa-pg-btn" disabled={pagination.page >= pagination.pages} onClick={() => onPageChange(pagination.page + 1)}>
                <i className="fas fa-chevron-right" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataTable;
