"use client"

import { Color_Extenson_Map } from "@/lib/constants"
import { FileType } from "@/typings"
import { ColumnDef } from "@tanstack/react-table"
import { Download, Trash } from "lucide-react"
import Link from "next/link"
import prettyBytes from "pretty-bytes"
import { FileIcon,defaultStyles } from "react-file-icon"


export const columns: ColumnDef<FileType>[]=[
    {
        accessorKey:"type",
        header:"type",
        cell:({renderValue,...props})=>{
            const type=renderValue()as string
           const extension:string =type.split("/")[1];
           return(
            <div className="w-10">
                <FileIcon
                extension={extension}
                labelColor={Color_Extenson_Map[extension]}
                //@ts-ignore
                {...defaultStyles[extension]}
                />
            </div>
           )
        }
    },

    {
        accessorKey:"filename",
        header:"File Name"
    },
    {
        accessorKey:"timestamp",
        header:"Date Added",
        cell: ({ renderValue, ...props }) => {
            return <span>{(renderValue() as Date).toLocaleString()}</span>
        }
    },
    {
        accessorKey:"size",
        header:"Size",
        cell:({renderValue,...props})=>{
            return <span>{prettyBytes(renderValue()as number)}</span>
        }
    },
    {
        accessorKey: "downloadURL",
        header:"Link",
        cell:({renderValue,...props})=>{
            return(
            <Link
            href={`${renderValue()as string}`}
            target="_blank"
                    className="text-blue-500 hover:text-green-600 cursor-pointer hover:animate-bounce">
           <Download className="hover:animate-bounce my-2"/>
            </Link>
            )
        }
    },
    {
        accessorKey:"delete",
        header:"Delete",
        cell:({row,renderValue,...props})=>{
           
            return(
                <button
                className="text-red-500 hover:text-red-700">
                   <Trash className="hover:animate-pulse"/>
                </button>
            )
        }
    }
]