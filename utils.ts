
import * as pdfjsLib from 'pdfjs-dist';
import { generateNewName as sharedGenerateNewName } from './sharedUtils';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

// Re-export generateFileName for App.tsx compatibility
export const generateFileName = sharedGenerateNewName;

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Process file for Gemini API.
 * If PDF/Image is large (> 10MB), we optimize it.
 * For PDFs, we render the first page as an image.
 */
export const processFileForAnalysis = async (file: File): Promise<{ mimeType: string, data: string }> => {
  const SIZE_LIMIT = 10 * 1024 * 1024; // 10MB limit for optimization trigger

  // If file is small, send as is
  if (file.size < SIZE_LIMIT) {
    const base64 = await fileToBase64(file);
    return { mimeType: file.type, data: base64 };
  }

  // Handle large PDF: Render 1st page to image
  if (file.type === 'application/pdf') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1); // Get first page
      
      const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better text quality
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (!context) throw new Error("Cannot create canvas context");

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      
      // Convert to JPEG (reduced size)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64 = dataUrl.split(',')[1];
      
      console.log(`Optimized PDF: Page 1 rendered to JPEG (${base64.length} bytes)`);
      return { mimeType: 'image/jpeg', data: base64 };
    } catch (e) {
      console.error("PDF Processing Error:", e);
      throw new Error("Không thể xử lý file PDF lớn. Vui lòng thử file nhỏ hơn.");
    }
  }

  // Handle large Images: Resize
  if (file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 2048;
        const scale = MAX_WIDTH / img.width;
        
        // Only resize if actually larger
        if (scale < 1) {
           canvas.width = MAX_WIDTH;
           canvas.height = img.height * scale;
        } else {
           canvas.width = img.width;
           canvas.height = img.height;
        }

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve({ mimeType: 'image/jpeg', data: dataUrl.split(',')[1] });
      };
      img.onerror = (e) => reject(new Error("Lỗi đọc file ảnh"));
      img.src = URL.createObjectURL(file);
    });
  }

  throw new Error(`File quá lớn (${(file.size/1024/1024).toFixed(2)}MB) và không hỗ trợ xử lý.`);
};

export const downloadFile = (file: File, newName: string) => {
  const extension = file.name.split('.').pop();
  const blob = new Blob([file], { type: file.type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${newName}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
