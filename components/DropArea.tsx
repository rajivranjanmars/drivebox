"use client"
import { db, storage } from '@/firebase';
import { cn } from '@/lib/utils';
import { useUser } from '@clerk/nextjs';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import DropZone from 'react-dropzone'

const DropArea = () => {
    const [loading,setIsLoading]=useState(false)
    const {isLoaded ,isSignedIn,user} = useUser()
    const maxSize = 20 * 1024 * 1024;

    const uploadPost= async(selectedFile:File)=>{
        if(loading) return;
        if(!user) return;
        setIsLoading(true);
        const docRef = await addDoc(collection(db,"users",user.id,"files"),{
            userId:user.id,
            filename: selectedFile.name,
            fullName: user.fullName,
            profileImg:user.imageUrl,
            timestamp:serverTimestamp(),
            type:selectedFile.type,
            size:selectedFile.size
        });
        const imageRef= ref(storage,`users/${user.id}/files/${docRef.id}`);

        uploadBytes(imageRef,selectedFile).then(async(snapshot)=>{
            const downloadURL=await getDownloadURL(imageRef)
            await updateDoc(doc(db,"users",user.id,"files",docRef.id),{
                downloadURL:downloadURL,
            })
        })
        setIsLoading(false)
    }

   const onDrop= (acceptedFiles:File[] )=>{
        acceptedFiles.forEach((file) => {
            const reader= new FileReader();
            reader.onabort = () => console.log("File reading was aborted")
            reader.onerror = () => console.log(" Couldn't open file");
            reader.onload =async()=>{
                await uploadPost(file);
            }
            reader.readAsArrayBuffer(file)
        });
   }

    return (
        <DropZone minSize={0} maxSize={maxSize} onDrop={onDrop}>
            {({
                getRootProps,getInputProps,isDragActive, isDragReject, fileRejections,
            }) => { 
                const isFileTooLarge =fileRejections.length>0 && fileRejections[0].file.size>maxSize;
                return(
            <section className='m-4'>
                <div {...getRootProps()} className={ cn(
                    "w-full h-52 flex justify-center items-center p-5 border border-dashed rounded-lg text-center",
                    isDragActive?"bg-[#6697e7] text-white animate-pulse":"bg-slate-100/50 dark:bg-slate-800/80 text-slate-400"
                )
                }
                >
                    <input {...getInputProps()}/>
                    {!isDragActive && "Click here or drop a file to upload"}
                    {isDragActive && !isDragReject && "Drag to upload this file"}
                    {isDragReject && "File Type not Accepted"}
                    {isFileTooLarge && (
                        <div className='text-danger mt-10 items-center flex flex-row justify-center'>
                            
                            File is Too large
                        </div>
                    )}
                </div>
            </section>
                );
            }}
        </DropZone>
    )
}

export default DropArea