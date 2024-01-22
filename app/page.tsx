import { UserButton } from "@clerk/nextjs"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
export default function Home() {
  return (
   <div>
      <div className="p-10  flex flex-col sm:text-xl md:text-5xl dark:text-white space-y-4">
        <h1 className="font-extrabold ">Welcome to DriveBox</h1>
        <p className="justify-">
          Save All your files in one Place
        </p>
        <Link href="/dashboard" className="flex items-center cursor-pointer bg-blue-500 p-5 w-fit text-xl">
          Try it for free
          <ArrowRight className="ml-3"/>
        </Link>
      </div>
   </div>
  )
}
