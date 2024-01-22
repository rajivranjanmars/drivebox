"use client"
import { FileType } from '@/typings'
import React, { use, useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { DataTable } from './DataTable'
import { columns } from './columns'
import { useUser } from '@clerk/nextjs'
import { useCollection } from 'react-firebase-hooks/firestore'
import { collection, orderBy, query } from 'firebase/firestore'
import { db } from '@/firebase'
import { Skeleton } from '../ui/skeleton'
const TableWrapper = ({ skeltonFiles }: { skeltonFiles: FileType[] }) => {
  const { isSignedIn, user, isLoaded } = useUser();
  const [initialFiles, setInitialFiles] = useState<FileType[]>([])
  const [sort, setSort] = useState<"asc" | "desc">("desc")


  const [docs, loading, error] = useCollection(
    user && query(
      collection(db, "users", user.id, "files"),
      orderBy("timestamp", sort)
    )
  )

  useEffect(() => {
    if (!docs) return;
    const files: FileType[] = docs?.docs?.map((doc) => ({
      id: doc.id,
      filename: doc.data().filename,
      timestamp: new Date(doc.data().timestamp?.seconds * 1000) || undefined,
      fullname: doc.data().fullname,
      downloadURL: doc.data().downloadURL,
      type: doc.data().type,
      size: doc.data().size
    }));
    setInitialFiles(files)
  }, [docs])
 
  if (docs?.docs.length === undefined) return (<>
    <div className='flex flex-col '>
      <Button variant={"outline"} className=' w-36 h-10 mb-5' >
        <Skeleton className='h-5 w-full' />
      </Button>
      <div className='border rounded-lg' >
        <div className="border-b ">
          {skeltonFiles.map((file) => (
            <div key={file.id} className='flex flex=col items-center space-x-4 p-5 w-full' >
              <Skeleton className='h-12 w-12' />
              <Skeleton className='h-12 w-full' />
            </div>

          ))}
          {skeltonFiles.length === 0 && (
            <div className='flex items-center space-x-4 p-5 w-full' >
              <Skeleton className='h-12 w-12 my-5' />
              <Skeleton className='h-12 w-full' />
            </div>

          )}
        </div>
      </div>

    </div>
  </>)
  return (
    <div>
      <Button onClick={() => setSort(sort === "desc" ? "asc" : "desc")}>
        Sort By {sort === "desc" ? "Newest" : "Oldest"}

      </Button>
      <DataTable columns={columns} data={initialFiles} />
    </div>
  )
}

export default TableWrapper