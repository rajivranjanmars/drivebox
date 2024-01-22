import { create } from "zustand";

interface AppState {
    isDeleteModalOpen: boolean;
    setIsDeleteModalOpen: (open: boolean) => void;

    isRenameModalOpen: boolean;
    setIsRenameModalOpen: (open: boolean) => void;

    fileId: string|null;
    setFileId: (fileIdd: string) => void;

    fileName: string;
    setFileName: (fileName: string) => void;

}

export const useAppStore = create<AppState>()((set) => ({
    fileId: null,
    setFileId:(fileId:string)=>set((state)=>({fileId})),

    fileName:"",
    setFileName:(fileName:string)=>set((state)=>({fileName})),

    isDeleteModalOpen: false,
    setIsDeleteModalOpen: (isDeleteModalOpen) => set((state) => ({ isDeleteModalOpen })),

    isRenameModalOpen: false,
    setIsRenameModalOpen: (isRenameModalOpen) => set((state) => ({ isRenameModalOpen })),
}));