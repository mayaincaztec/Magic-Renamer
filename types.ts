
export interface DocumentMetadata {
  date: string; // YYYYMMDD
  docNumber: string;
  agency: string;
  summary: string;
  originalFileName: string;
  isDraft?: boolean;
}

export interface ProcessedFile {
  id: string;
  file: File;
  path?: string; // Absolute path (only available in Electron/Desktop)
  previewUrl: string;
  status: 'pending' | 'analyzing' | 'success' | 'renamed' | 'error';
  metadata: DocumentMetadata | null;
  newName: string | null;
  error: string | null;
}
