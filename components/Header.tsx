import { SignInButton, SignedOut, UserButton } from '@clerk/nextjs';
import Image from 'next/image';
import Link from 'next/link'
import React from 'react'
import { ModeToggle } from './ModeToggle';

const Header = () => {
    return (
        <header className='flex flex-row items-center justify-between m-2' >
            <Link href="/" className='flex items-center space-x-2'>

                <div className=" rounded hidden md:block border-slate-600 ">
                    <Image
                        src="/folders.png"
                        alt='logo'
                        height={50}
                        width={50}
                        className=' object-contain '
                    />
                </div>
                <h1 className='font-bold font-serif text-[#00a2ff] text-xl mx-2' >
                    DriveBox
                </h1>

            </Link>

            <div className='flex items-center  px-5 space-x-2 my-1' >
                <ModeToggle/>
                <UserButton afterSignOutUrl='/' />
                    <SignedOut>
                        <SignInButton afterSignInUrl='/dashboard' mode='modal' />
                    </SignedOut>
              
            </div>
        </header>
    )
}

export default Header;