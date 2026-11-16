import { useMemo, useRef } from 'react';
import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { EmptyState } from './EmptyState.jsx';

const DATA_TABLE_FEATURES = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const EMPTY_ROWS = [];

/**
 * Dual-theme reusable data table built on TanStack Table v9 with optional
 * global search, sorting, client pagination, and TanStack Virtual row virtualization.
 */
export function DataTable({
  columns,
  data,
  searchable = true,
  searchPlaceholder = 'Cari data...',
  sortable = true,
  paginated = true,
  pageSize = 10,
  virtualized = false,
  virtualHeight = 420,
  estimateRowHeight = 48,
  loading = false,
  emptyTitle = 'Tidak ada data ditemukan',
  emptyDescription = 'Coba ubah kata kunci pencarian atau filter yang dipilih.',
  toolbarExtra,
  onRowClick,
  getRowId,
  className,
}) {
  const scrollContainerRef = useRef(null);
  const stableData = useMemo(() => (Array.isArray(data) ? data : EMPTY_ROWS), [data]);

  const table = useTable({
    features: DATA_TABLE_FEATURES,
    columns,
    data: stableData,
    getRowId,
    enableGlobalFilter: searchable,
    globalFilterFn: 'includesString',
    enableSorting: sortable,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: virtualized || !paginated ? Math.max(stableData.length, 50) : pageSize,
      },
    },
  });

  const rows = table.getRowModel().rows;
  const globalFilterValue = String(table.state.globalFilter ?? '');

  const virtualizer = useVirtualizer({
    count: virtualized ? rows.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 6,
  });

  const headerGroups = table.getHeaderGroups();

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {(searchable || toolbarExtra) && (
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {searchable ? (
            <div className="relative w-full sm:max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={globalFilterValue}
                onChange={(event) => table.setGlobalFilter(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-9"
              />
            </div>
          ) : (
            <div />
          )}
          {toolbarExtra && <div className="flex items-center gap-2">{toolbarExtra}</div>}
        </div>
      )}

      {loading ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div
          ref={scrollContainerRef}
          style={virtualized ? { maxHeight: `${virtualHeight}px`, overflowY: 'auto' } : undefined}
          className="overflow-x-auto rounded-2xl border border-border bg-card shadow-2xs"
        >
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-1 bg-muted/60 backdrop-blur-xs">
              {headerGroups.map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border">
                  {headerGroup.headers.map((header) => {
                    const canSort = sortable && header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className="px-4 py-3 text-xs font-semibold tracking-wider uppercase text-muted-foreground whitespace-nowrap"
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1.5 text-left hover:text-foreground cursor-pointer"
                          >
                            <table.FlexRender header={header} />
                            {sortDir === 'asc' ? (
                              <ArrowUp className="size-3.5 text-primary" aria-hidden="true" />
                            ) : sortDir === 'desc' ? (
                              <ArrowDown className="size-3.5 text-primary" aria-hidden="true" />
                            ) : (
                              <ArrowUpDown className="size-3.5 opacity-45" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            {virtualized ? (
              <tbody
                style={{
                  position: 'relative',
                  height: `${virtualizer.getTotalSize()}px`,
                  display: 'block',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <tr
                      key={row.id}
                      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        display: 'table',
                        tableLayout: 'fixed',
                      }}
                      className={cn(
                        'border-b border-border/70 transition-colors hover:bg-muted/40',
                        onRowClick && 'cursor-pointer'
                      )}
                    >
                      {row.getAllCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3 text-foreground align-middle">
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            ) : (
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      'border-b border-border/70 last:border-b-0 transition-colors hover:bg-muted/40',
                      onRowClick && 'cursor-pointer'
                    )}
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3 text-foreground align-middle"
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      )}

      {paginated && !virtualized && !loading && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Halaman{' '}
            <strong className="text-foreground">
              {(table.state.pagination?.pageIndex ?? 0) + 1}
            </strong>{' '}
            dari <strong className="text-foreground">{Math.max(table.getPageCount(), 1)}</strong> (
            {table.getRowCount()} data)
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="xs"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              aria-label="Halaman berikutnya"
            >
              Berikutnya
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
