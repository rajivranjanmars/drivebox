import { useAppStore } from "@/store";


const [isDeleteModalOpen, setIsDeleteModalOpen] = useAppStore((state) => [
  state.isDeleteModalOpen,
  state.setIsDeleteModalOpen,
]);
