
export type RenamingMode = 'standard' | 'legislative';

export interface DocumentMetadata {
  date: string; // YYYYMMDD
  docNumber: string;
  agency: string;
  summary: string;
  docType: string; // Loại văn bản: Luật, Nghị định, Nghị quyết, Thông tư, Quyết định...
  originalFileName: string;
  isDraft?: boolean;
}

export interface ProcessedFile {
  id: string;
  file: File;
  path?: string;
  previewUrl: string;
  status: 'pending' | 'analyzing' | 'success' | 'renamed' | 'error';
  metadata: DocumentMetadata | null;
  newName: string | null;
  error: string | null;
}
