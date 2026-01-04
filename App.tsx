
import React, { useState, useRef, useEffect } from 'react';
import { analyzeLegalDocument } from './geminiService';
import { processFileForAnalysis, downloadFile } from './utils';
import { generateNewName } from './sharedUtils';
import { ProcessedFile, RenamingMode } from './types';
import JSZip from 'jszip';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB Limit

interface ElectronAPI {
  renameFile: (oldPath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>;
  isDesktop: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

const App: React.FC = () => {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [history, setHistory] = useState<ProcessedFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>('');
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);
  const [renamingMode, setRenamingMode] = useState<RenamingMode>('standard');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDesktop = !!window.electronAPI;

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
        setApiKey(storedKey);
        setTempKey(storedKey);
    }
  }, []);

  useEffect(() => {
    if (files.length > 0 && !selectedFileId) {
      setSelectedFileId(files[0].id);
    }
  }, [files, selectedFileId]);

  const handleStartRenaming = () => {
    if (files.length === 0) {
        alert("Vui lòng thêm ít nhất một file để bắt đầu.");
        return;
    }
    if (!apiKey) {
        setShowKeyModal(true);
    } else {
        processAllPending();
    }
  };

  const processAllPending = async (keyToUse?: string) => {
    const activeKey = keyToUse || apiKey;
    if (!activeKey) return;

    setIsProcessingBatch(true);
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    
    // Sử dụng Promise.all để gửi yêu cầu xử lý song song tất cả các file cùng lúc
    // giúp tăng tốc độ xử lý đáng kể.
    try {
        await Promise.all(pendingFiles.map(f => 
            processFile(f.id, f.file, renamingMode, f.path, activeKey)
        ));
    } catch (err) {
        console.error("Lỗi trong quá trình xử lý hàng loạt:", err);
    } finally {
        setIsProcessingBatch(false);
    }
  };

  const handleSaveKey = () => {
    const trimmedKey = tempKey.trim();
    if (trimmedKey) {
        localStorage.setItem('gemini_api_key', trimmedKey);
        setApiKey(trimmedKey);
        setShowKeyModal(false);
    } else {
        alert("Vui lòng nhập API Key hợp lệ.");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    
    try {
        const newFiles: ProcessedFile[] = Array.from(uploadedFiles).map(file => {
          const isTooLarge = file.size > MAX_FILE_SIZE;
          return {
            id: Math.random().toString(36).substring(7),
            file,
            path: (file as any).path,
            previewUrl: URL.createObjectURL(file),
            status: isTooLarge ? 'error' : 'pending',
            metadata: null,
            newName: null,
            error: isTooLarge ? `File quá lớn (> ${MAX_FILE_SIZE / (1024 * 1024)}MB).` : null
          };
        });

        setFiles(prev => [...prev, ...newFiles]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
        console.error("Lỗi khi thêm file:", err);
    }
  };

  const processFile = async (id: string, file: File, mode: RenamingMode, filePath?: string, currentKey?: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'analyzing', error: null } : f));
    try {
      const { mimeType, data } = await processFileForAnalysis(file);
      const metadata = await analyzeLegalDocument(data, mimeType, currentKey);
      const newName = generateNewName(metadata, mode);
      
      let finalStatus: 'success' | 'renamed' = 'success';
      if (isDesktop && filePath && window.electronAPI) {
        const renameResult = await window.electronAPI.renameFile(filePath, newName);
        if (renameResult.success) finalStatus = 'renamed';
      }

      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: finalStatus, metadata, newName } : f));
    } catch (err: any) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: err.message || "Lỗi xử lý" } : f));
    }
  };

  const handleDownloadZip = async () => {
    const successFiles = files.filter(f => f.status === 'success' || f.status === 'renamed');
    if (successFiles.length === 0) {
      alert("Chưa có file nào được xử lý thành công.");
      return;
    }
    const zip = new JSZip();
    successFiles.forEach(f => {
      const ext = f.file.name.split('.').pop();
      zip.file(`${f.newName}.${ext}`, f.file);
    });
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Văn bản pháp lý - ${new Date().toLocaleDateString()}.zip`;
    link.click();
  };

  const removeFile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setFiles(prev => prev.filter(f => f.id !== id));
    if (selectedFileId === id) setSelectedFileId(null);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') return (
      <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
        <i className="fa-regular fa-file-pdf text-xl"></i>
      </div>
    );
    return (
      <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
        <i className="fa-regular fa-file-image text-xl"></i>
      </div>
    );
  };

  const selectedFile = files.find(f => f.id === selectedFileId);

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 h-screen flex flex-col font-sans text-slate-800">
      
      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <i className="fa-solid fa-key text-purple-600"></i> Cấu hình API Key
                    </h3>
                    <button type="button" onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-slate-600">
                      <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                <div className="mb-6">
                    <input type="password" value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder="AIza..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none" />
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-purple-600 mt-3 block hover:underline font-bold text-right">Lấy API Key miễn phí</a>
                </div>
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={handleSaveKey} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold uppercase text-xs tracking-widest transition-all">Lưu cấu hình</button>
                </div>
            </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none mb-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-900 rounded-2xl text-white shadow-xl flex items-center justify-center border border-white/20">
                <i className="fa-solid fa-wand-magic-sparkles text-2xl"></i>
            </div>
            <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                  Magic <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600">Renamer</span>
                </h1>
                <p className="text-slate-500 text-sm mt-1 font-medium">Công cụ thần kỳ hệ thống hóa văn bản pháp lý</p>
            </div>
        </div>
        
        <div className="flex gap-4 items-center">
            {/* Mode Selector */}
            <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1 border border-slate-200">
                <button 
                  type="button"
                  onClick={() => setRenamingMode('standard')}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${renamingMode === 'standard' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  VB Thông thường
                </button>
                <button 
                  type="button"
                  onClick={() => setRenamingMode('legislative')}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${renamingMode === 'legislative' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Luật/NĐ/TT
                </button>
            </div>

            <button type="button" onClick={() => setShowKeyModal(true)} className="bg-white border border-slate-200 text-slate-700 hover:border-purple-200 hover:text-purple-700 px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 text-xs uppercase tracking-widest shadow-sm">
                <i className={`fa-solid ${apiKey ? 'fa-check-circle text-green-500' : 'fa-key text-purple-500'}`}></i> {apiKey ? 'ĐÃ CÓ KEY' : 'NHẬP API KEY'}
            </button>

            <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-white border border-slate-200 text-slate-700 hover:border-purple-200 hover:text-purple-700 px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 text-xs uppercase tracking-widest shadow-sm">
                <i className="fa-solid fa-plus"></i> THÊM FILE
            </button>

            <button type="button" onClick={handleStartRenaming} disabled={isProcessingBatch || files.length === 0} className={`px-8 py-3 rounded-2xl font-bold transition-all shadow-xl flex items-center gap-3 uppercase text-xs tracking-widest ${isProcessingBatch ? 'bg-slate-100 text-slate-400' : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-purple-600/30 active:scale-95'}`}>
                <i className={`fa-solid ${isProcessingBatch ? 'fa-spinner animate-spin' : 'fa-bolt'}`}></i> {isProcessingBatch ? 'Đang chạy...' : 'ÚM BA LA ĐỐI TÊN'}
            </button>

            <button type="button" onClick={handleDownloadZip} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-slate-800 transition-all">
              <i className="fa-solid fa-file-zipper"></i> TẢI TOÀN BỘ (ZIP)
            </button>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" />
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Sidebar: Hàng chờ */}
        <div className="lg:col-span-4 flex flex-col bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden h-full">
            <div className="px-8 py-6 bg-slate-50/80 border-b border-slate-100 font-bold text-slate-700 flex justify-between items-center uppercase text-[11px] tracking-widest">
                <span className="flex items-center gap-2"><i className="fa-solid fa-layer-group text-purple-500"></i> HÀNG CHỜ ({files.length})</span>
                {files.length > 0 && <button type="button" onClick={() => setFiles([])} className="text-red-500 hover:underline">Xóa hết</button>}
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-white/50">
                {files.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 text-center space-y-4">
                        <i className="fa-solid fa-cloud-arrow-up text-5xl opacity-20"></i>
                        <p className="text-[11px] font-bold uppercase tracking-widest opacity-40">Kéo thả hoặc thêm file</p>
                    </div>
                ) : (
                    files.map(file => (
                        <div 
                          key={file.id} 
                          onClick={() => setSelectedFileId(file.id)} 
                          className={`p-5 rounded-[1.5rem] cursor-pointer border transition-all group relative ${selectedFileId === file.id ? 'bg-purple-50 border-purple-200 shadow-md ring-2 ring-purple-100 ring-offset-2' : 'bg-white border-slate-100 hover:border-purple-100 hover:shadow-sm'}`}
                        >
                            <div className="flex items-center gap-4">
                                {getFileIcon(file.file.type)}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold truncate text-slate-400 mb-1 tracking-tight">{file.file.name}</p>
                                    <p className={`text-xs font-black truncate ${file.status === 'error' ? 'text-red-500' : 'text-slate-800'}`}>
                                        {file.status === 'analyzing' ? (
                                          <span className="flex items-center gap-1"><i className="fa-solid fa-circle-notch animate-spin text-purple-500"></i> Đang xử lý...</span>
                                        ) : file.newName || 'Chờ úm ba la...'}
                                    </p>
                                </div>
                                <button type="button" onClick={(e) => removeFile(e, file.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-2"><i className="fa-solid fa-trash-can"></i></button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* Main Area: Chi tiết văn bản */}
        <div className="lg:col-span-8 flex flex-col h-full min-h-0">
            <div className="flex justify-between items-center mb-4 px-2">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                    <i className="fa-solid fa-eye text-purple-500"></i> XEM CHI TIẾT VĂN BẢN
                </h2>
                {selectedFile && selectedFile.newName && (
                   <button onClick={() => downloadFile(selectedFile.file, selectedFile.newName!)} className="text-[11px] font-bold text-purple-600 flex items-center gap-1.5 hover:underline uppercase tracking-widest">
                       <i className="fa-solid fa-download"></i> Tải file này
                   </button>
                )}
            </div>

            {selectedFile ? (
                 <div className="bg-white rounded-[3rem] shadow-xl border border-slate-100 flex flex-col h-full overflow-hidden">
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-6 gap-6">
                        {/* Preview Pane */}
                        <div className="md:w-[55%] bg-slate-900 rounded-[2rem] overflow-hidden flex items-center justify-center relative shadow-inner">
                            {selectedFile.file.type.startsWith('image/') ? (
                                <img src={selectedFile.previewUrl} alt="Preview" className="max-h-full max-w-full object-contain p-4" />
                            ) : (
                                <iframe src={selectedFile.previewUrl} className="w-full h-full bg-white border-none" title="Preview" />
                            )}
                        </div>

                        {/* Metadata Pane */}
                        <div className="md:w-[45%] overflow-y-auto space-y-5 pr-2 custom-scrollbar">
                            {selectedFile.status === 'analyzing' ? (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 bg-slate-50/50 rounded-[2rem]">
                                    <div className="w-16 h-16 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin shadow-lg"></div>
                                    <p className="font-black text-purple-600 text-[11px] uppercase tracking-[0.3em]">AI đang tinh lọc dữ liệu...</p>
                                </div>
                            ) : selectedFile.metadata ? (
                                <div className="space-y-5">
                                    {/* Proposed Filename Card */}
                                    <div className="bg-slate-900 text-white p-7 rounded-[2rem] shadow-2xl relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <i className="fa-solid fa-file-signature text-5xl"></i>
                                        </div>
                                        <label className="text-[9px] font-black text-purple-400 uppercase tracking-[0.3em] block mb-3">Tên file được AI đề xuất</label>
                                        <div className="flex items-start gap-4">
                                            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0 border border-white/10">
                                              <i className="fa-solid fa-file-pen text-purple-400"></i>
                                            </div>
                                            <p className="text-[13px] font-bold leading-relaxed tracking-tight break-all">
                                              {selectedFile.newName}.{selectedFile.file.name.split('.').pop()}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Grid Info Cards */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100">
                                            <p className="text-[9px] text-slate-400 font-black uppercase mb-2 tracking-widest">Ngày ban hành</p>
                                            <p className="font-black text-slate-800 text-lg">{selectedFile.metadata.date}</p>
                                        </div>
                                        <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100">
                                            <p className="text-[9px] text-slate-400 font-black uppercase mb-2 tracking-widest">Số hiệu</p>
                                            <p className="font-black text-slate-800 text-lg leading-tight">{selectedFile.metadata.docNumber || '---'}</p>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100">
                                        <p className="text-[9px] text-slate-400 font-black uppercase mb-2 tracking-widest">Cơ quan ban hành</p>
                                        <p className="font-bold text-slate-800 text-[13px]">{selectedFile.metadata.agency}</p>
                                    </div>

                                    <div className="bg-purple-50 p-6 rounded-[2rem] border border-purple-100 relative">
                                        <div className="absolute top-4 right-6 text-purple-200">
                                            <i className="fa-solid fa-quote-right text-2xl"></i>
                                        </div>
                                        <p className="text-[9px] text-purple-600 font-black uppercase mb-3 tracking-[0.2em]">Trích yếu nội dung</p>
                                        <p className="text-[13px] text-slate-700 leading-relaxed font-medium italic">"{selectedFile.metadata.summary}"</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300 text-center bg-slate-50/50 rounded-[2rem] p-8">
                                    <i className="fa-solid fa-magic-wand-sparkles text-5xl mb-6 opacity-20"></i>
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-40">Sẵn sàng phân tích thần kỳ</p>
                                </div>
                            )}
                        </div>
                    </div>
                 </div>
            ) : (
                <div className="h-full bg-slate-50 border-4 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center text-slate-400 group">
                    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm mb-6 group-hover:scale-110 transition-transform">
                       <i className="fa-solid fa-file-lines text-3xl opacity-30"></i>
                    </div>
                    <p className="font-black text-slate-500 uppercase text-[11px] tracking-[0.3em]">Chọn văn bản để bắt đầu</p>
                </div>
            )}
        </div>
      </main>

      {/* Footer Credit */}
      <footer className="flex-none py-6 mt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          <span>© 2026 MAGIC RENAMER SYSTEM</span>
          <span className="flex items-center gap-2">
              POWERED BY <span className="text-purple-500">GOOGLE GEMINI 3</span> 
              <span className="text-slate-200">|</span> 
              CREATED BY <span className="text-slate-600">T2BUEH</span>
          </span>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
};

export default App;
