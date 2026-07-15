"use client";

import { useMemo, useState } from "react";
import type { FileType } from "@/typings";
import { Button } from "../ui/button";
import { DataTable } from "./DataTable";
import { columns } from "./columns";

/** Adds client-side ordering controls around the server-provided file table. */
const TableWrapper = ({ files }: { files: FileType[] }): React.JSX.Element => {
  const [sort, setSort] = useState<"asc" | "desc">("desc");

  const sortedFiles = useMemo(
    () => [...files].sort((left, right) => {
      const comparison = new Date(left.timestamp).getTime()
        - new Date(right.timestamp).getTime();
      return sort === "asc" ? comparison : -comparison;
    }),
    [files, sort],
  );

  return (
    <div>
      <Button onClick={() => setSort(sort === "desc" ? "asc" : "desc")}>
        Sort by {sort === "desc" ? "newest" : "oldest"}
      </Button>
      <DataTable columns={columns} data={sortedFiles} />
    </div>
  );
};

export default TableWrapper;
