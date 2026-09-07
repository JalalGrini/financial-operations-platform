"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { PageToolbar } from "@/components/ui/page-toolbar";

// ---------------------------------------------------------------------------
// DataTable -- compound component that wires Table + PageToolbar + Pagination
//
// Inspired by shadcnblocks.com full data-table pattern + 21st.dev table design.
//
// Usage:
//   <DataTable
//     columns={columns}
//     data={rows}
//     isLoading={query.isLoading}
//     search={search}
//     onSearch={setSearch}
//     page={page}
//     pageCount={pageCount}
//     onPageChange={setPage}
//     totalCount={total}
//     actions={<Button onClick={onCreate}><Plus /> New</Button>}
//   />
// ---------------------------------------------------------------------------

export type ColumnDef<TRow> = {
  /** Unique key -- matches a key in TRow or a custom accessor id */
  id: string;
  /** Header label */
  header: string;
  /** Cell renderer -- return a React node */
  cell: (row: TRow) => React.ReactNode;
  /** Column width (e.g. "w-32" or "w-1/4") */
  className?: string;
  /** Header className */
  headerClassName?: string;
  /** Make column sortable */
  sortable?: boolean;
};

export interface DataTableProps<TRow> {
  /** Column definitions */
  columns: ColumnDef<TRow>[];
  /** Row data */
  data: TRow[];
  /** Row key extractor */
  rowKey?: (row: TRow) => string | number;
  /** Loading state -- shows TableSkeleton */
  isLoading?: boolean;
  /** Empty state message */
  emptyMessage?: string;

  // Toolbar
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;

  // Pagination
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  totalCount?: number;

  // Sort
  sortKey?: string;
  sortDir?: "asc" | "desc" | null;
  onSort?: (key: string) => void;

  // Row interaction
  onRowClick?: (row: TRow) => void;

  className?: string;
  tableClassName?: string;
}

export function DataTable<TRow>({
  columns,
  data,
  rowKey,
  isLoading,
  emptyMessage = "No results found",
  search,
  onSearch,
  searchPlaceholder,
  filters,
  actions,
  page = 1,
  pageCount = 1,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalCount,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  className,
  tableClassName,
}: DataTableProps<TRow>) {
  const showToolbar =
    onSearch !== undefined || filters !== undefined || actions !== undefined;
  const showPagination =
    onPageChange !== undefined && (pageCount > 1 || totalCount !== undefined);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      {showToolbar && (
        <PageToolbar
          search={search}
          onSearch={onSearch}
          searchPlaceholder={searchPlaceholder}
          filters={filters}
          actions={actions}
          resultCount={totalCount}
        />
      )}

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={5} columns={columns.length} />
      ) : (
        <Table className={tableClassName}>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  className={col.headerClassName}
                  sortDir={sortKey === col.id ? sortDir : null}
                  onSort={
                    col.sortable && onSort
                      ? () => onSort(col.id)
                      : undefined
                  }
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableEmpty message={emptyMessage} colSpan={columns.length} />
            ) : (
              data.map((row, rowIdx) => (
                <TableRow className={cn("row-hover", onRowClick && "cursor-pointer")}
                  key={rowKey ? rowKey(row) : rowIdx}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <TableCell key={col.id} className={col.className}>
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {/* Pagination */}
      {showPagination && (
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={onPageChange!}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          totalCount={totalCount}
        />
      )}
    </div>
  );
}
