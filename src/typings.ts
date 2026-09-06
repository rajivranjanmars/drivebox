export interface FileType {
  id: string;
  filename: string;
  relativePath: string;
  timestamp: string;
  downloadURL: string;
  type: string;
  size: number;
}

export interface FolderType {
  id: string;
  path: string;
}
