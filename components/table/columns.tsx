"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";
import Link from "next/link";
import prettyBytes from "pretty-bytes";
import { FileIcon, defaultStyles } from "react-file-icon";
import { Color_Extenson_Map } from "@/lib/constants";
import type { FileType } from "@/typings";

export const columns: ColumnDef<FileType>[] = [
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ renderValue }) => {
      const type = renderValue() as string;
      const extension = type.split("/")[1] || "txt";
      const iconStyle = defaultStyles[extension as keyof typeof defaultStyles]
        ?? defaultStyles.txt;
      return (
        <div className="w-10">
          <FileIcon
            extension={extension}
            labelColor={Color_Extenson_Map[extension]}
            {...iconStyle}
          />
        </div>
      );
    },
  },
  {
    accessorKey: "filename",
    header: "File name",
  },
  {
    accessorKey: "timestamp",
    header: "Date added",
    cell: ({ renderValue }) => (
      <span>{new Date(renderValue() as string).toLocaleString()}</span>
    ),
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ renderValue }) => (
      <span>{prettyBytes(renderValue() as number)}</span>
    ),
  },
  {
    accessorKey: "downloadURL",
    header: "Download",
    cell: ({ renderValue, row }) => (
      <Link
        href={renderValue() as string}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Download ${row.original.filename}`}
        className="cursor-pointer text-blue-500 hover:text-green-600"
      >
        <Download className="my-2 hover:animate-bounce" />
      </Link>
    ),
  },
  {
    id: "delete",
    header: "Delete",
  },
];
