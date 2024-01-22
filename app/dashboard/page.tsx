import React from 'react'
import { auth } from '@clerk/nextjs'
import DropArea from '@/components/DropArea'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/firebase'
import { FileType } from '@/typings'
import TableWrapper from '@/components/table/TableWrapper'
async function Dashboard() {
  const{ userId} =auth()
  
  const docResults=await getDocs(collection(db,"users",userId!,"files"))
  const skeltonFiles: FileType[]=docResults.docs.map(doc=>({
    id:doc.id,
    filename:doc.data().filename|| doc.id,
    timestamp:new Date(doc.data().timestamp?.seconds*1000)|| undefined,
    fullname:doc.data().fullname,
    downloadURL:doc.data().downloadURL,
    type:doc.data().type,
    size:doc.data().size,
  }))

  return (
    <div>
      <div className="p-10 flex flex-col dark:text-white space-y-4">
        <DropArea/>
        <section className='container space-y-5'>
          <h2 className='font-bold'>
            ALL Files
          </h2>
          <div className="">
            <TableWrapper skeltonFiles={skeltonFiles}/>
            
          </div>
        </section>
      </div>
    </div>
  )
}

export default Dashboard