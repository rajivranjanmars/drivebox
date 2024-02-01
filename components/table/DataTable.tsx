"use client"

import {
    ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from "@tanstack/react-table"

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Trash } from "lucide-react"
import { getStorage, ref, deleteObject } from "firebase/storage";
import { useUser } from "@clerk/nextjs";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from '@/firebase';

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[]
    data: TData[]
}

export function DataTable<TData, TValue>({
    columns,
    data,
}: DataTableProps<TData, TValue>) {
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
    })

    const storage = getStorage();
    const { isLoaded, isSignedIn, user } = useUser()
    
    return (
        <div className="rounded-md border my-5">
            <Table>
                <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => {
                                return (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )}
                                    </TableHead>
                                )
                            })}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => (
                            <TableRow
                                key={row.id}
                                data-state={row.getIsSelected() && "selected"}
                            >
                                {row.getVisibleCells().map((cell: any) => (
                                    <TableCell key={cell.id}>
                                        
                                        {cell.column.id === "delete" ? (<>
                                            <button  onClick={async () => {
                                               try {
                                                   await deleteDoc(doc(db, `users/${user?.id}/files/${cell.row.original.id}`))
                                                   deleteObject(ref(storage, `users/${user?.id}/files/${cell.row.original.id}`))

                                               } catch (error) {
                                                
                                               } 
                                            } }
                                                className="text-red-500 hover:text-red-700">
                                                <Trash className="hover:animate-pulse" />
                                            </button>
                                        </>) : (flexRender(cell.column.columnDef.cell, cell.getContext()))}
                                       
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="h-24 text-center">
                                You have no Files.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
