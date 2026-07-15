"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FileType } from "@/typings";

interface DataTableProps {
  columns: ColumnDef<FileType>[];
  data: FileType[];
}

/** Renders file metadata and handles authenticated deletion through the API. */
export function DataTable({
    columns,
    data,
}: DataTableProps): React.JSX.Element {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // TanStack Table intentionally exposes non-memoizable callbacks; React Compiler skips this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  /** Deletes one owned file and refreshes server-rendered metadata. */
  async function deleteFile(fileId: string): Promise<void> {
    setDeletingId(fileId);
    setError(null);

    try {
      const response = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: "Delete failed" })) as { error?: string };
        throw new Error(payload.error || "Delete failed");
      }
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="my-5 rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {cell.column.id === "delete" ? (
                      <button
                        type="button"
                        aria-label={`Delete ${cell.row.original.filename}`}
                        disabled={deletingId === cell.row.original.id}
                        onClick={() => void deleteFile(cell.row.original.id)}
                        className="text-red-500 hover:text-red-700 disabled:opacity-50"
                      >
                        <Trash className="hover:animate-pulse" />
                      </button>
                    ) : (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                You have no files.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {error && (
        <p role="alert" className="px-4 pb-4 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
