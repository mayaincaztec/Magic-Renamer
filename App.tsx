
import React, { useState, useRef, useEffect } from 'react';
import { analyzeLegalDocument } from './geminiService';
import { processFileForAnalysis, generateFileName, downloadFile } from './utils';
import { ProcessedFile } from './types';
import JSZip from 'jszip';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB Limit

// Interface for Electron Bridge
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
  const [history, setHistory] = useState<ProcessedFile[]>([]); // State mới cho lịch sử
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>('');
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDesktop = !!window.electronAPI;

  // Load API Key from LocalStorage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
        setApiKey(storedKey);
        setTempKey(storedKey);
    }
  }, []);

  // Auto-select first file
  useEffect(() => {
    if (files.length > 0 && !selectedFileId) {
      setSelectedFileId(files[0].id);
    }
  }, [files]);

  // Handle starting the batch process
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
    
    // Process files sequentially to avoid rate limits
    for (const f of pendingFiles) {
        await processFile(f.id, f.file, f.path, activeKey);
    }
    setIsProcessingBatch(false);
  };

  // Save Key and Start
  const handleSaveKeyAndStart = () => {
    const trimmedKey = tempKey.trim();
    if (trimmedKey) {
        localStorage.setItem('gemini_api_key', trimmedKey);
        setApiKey(trimmedKey);
        setShowKeyModal(false);
        processAllPending(trimmedKey); // Try to process if there are pending files
    } else {
        alert("Vui lòng nhập API Key hợp lệ.");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;
    
    // 1. Logic di chuyển file đã xong vào Lịch sử
    const completedFiles = files.filter(f => f.status === 'success' || f.status === 'renamed');
    const incompleteFiles = files.filter(f => f.status !== 'success' && f.status !== 'renamed');

    if (completedFiles.length > 0) {
        setHistory(prev => [...prev, ...completedFiles]);
    }

    // 2. Tạo object cho file mới
    const newFiles: ProcessedFile[] = (Array.from(uploadedFiles) as File[]).map(file => {
      const isTooLarge = file.size > MAX_FILE_SIZE;
      const filePath = (file as any).path;

      return {
        id: Math.random().toString(36).substring(7),
        file,
        path: filePath,
        previewUrl: URL.createObjectURL(file),
        status: isTooLarge ? 'error' : 'pending',
        metadata: null,
        newName: null,
        error: isTooLarge ? `File quá lớn (> ${MAX_FILE_SIZE / (1024 * 1024)}MB).` : null
      };
    });

    // 3. Cập nhật hàng chờ: Giữ lại file chưa xong + File mới
    setFiles([...incompleteFiles, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = async (id: string, file: File, filePath?: string, currentKey?: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'analyzing', error: null } : f));

    try {
      const { mimeType, data } = await processFileForAnalysis(file);
      const result = await analyzeLegalDocument(data, mimeType, currentKey);
      const newName = generateFileName(result);
      
      let finalStatus: 'success' | 'renamed' = 'success';
      
      if (isDesktop && filePath && window.electronAPI) {
        const renameResult = await window.electronAPI.renameFile(filePath, newName);
        if (renameResult.success) {
            finalStatus = 'renamed';
        }
      }

      setFiles(prev => prev.map(f => f.id === id ? { 
        ...f, 
        status: finalStatus,
        metadata: result,
        newName: newName
      } : f));

    } catch (err: any) {
      let errorMessage = err.message || "Lỗi xử lý";
      
      // Xử lý thông báo lỗi chi tiết
      if (errorMessage.includes("QUOTA_EXCEEDED") || errorMessage.includes("429")) {
        errorMessage = "API Key đã hết hạn mức (Quota). Vui lòng dùng Key khác.";
      } else {
        const isAuthError = errorMessage.includes('API Key') || errorMessage.includes('401') || errorMessage.includes('403');
        if (isAuthError) errorMessage = "API Key không hợp lệ. Vui lòng kiểm tra lại.";
      }

      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: errorMessage } : f));
    }
  };

  const removeFile = (e: React.MouseEvent, id: string, fromHistory = false) => {
    e.stopPropagation();
    
    // Tìm file để revoke URL tránh leak memory
    const targetList = fromHistory ? history : files;
    const fileToRemove = targetList.find(f => f.id === id);
    if (fileToRemove) URL.revokeObjectURL(fileToRemove.previewUrl);

    if (fromHistory) {
        setHistory(prev => prev.filter(f => f.id !== id));
    } else {
        setFiles(prev => prev.filter(f => f.id !== id));
    }
    
    if (selectedFileId === id) setSelectedFileId(null);
  };

  const downloadAll = async () => {
    const successFiles = files.filter(f => f.status === 'success' && f.newName);
    if (successFiles.length === 0) return;

    const zip = new JSZip();
    successFiles.forEach(item => {
        const extension = item.file.name.split('.').pop();
        const fileName = `${item.newName}.${extension}`;
        zip.file(fileName, item.file);
    });

    try {
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const link = document.body.appendChild(document.createElement('a'));
        link.href = url;
        link.download = `magic_renamed_${new Date().getTime()}.zip`;
        link.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        alert("Có lỗi khi tạo file nén.");
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') {
        return <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100"><i className="fa-regular fa-file-pdf text-xl"></i></div>;
    }
    return <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100"><i className="fa-regular fa-file-image text-xl"></i></div>;
  };

  // Tìm file đang chọn trong cả Hàng chờ và Lịch sử
  const selectedFile = files.find(f => f.id === selectedFileId) || history.find(f => f.id === selectedFileId);
  const hasPendingFiles = files.some(f => f.status === 'pending' || f.status === 'error');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 h-screen flex flex-col select-none relative font-sans text-slate-800">
      
      {/* API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border border-slate-100 animate-[scaleIn_0.2s_ease-out]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <i className="fa-solid fa-key text-purple-600"></i>
                        Cấu hình API Key
                    </h3>
                    <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-slate-600"><i className="fa-solid fa-xmark text-xl"></i></button>
                </div>
                <div className="mb-6">
                    <p className="text-sm text-slate-600 mb-4 leading-relaxed">Nhập <strong>Google Gemini API Key</strong> để bắt đầu quá trình trích xuất thông tin bằng AI.</p>
                    <input 
                        type="password"
                        value={tempKey}
                        onChange={(e) => setTempKey(e.target.value)}
                        placeholder="AIza..."
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all text-slate-900"
                    />
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-purple-600 mt-3 block hover:underline font-bold">
                        Lấy API Key miễn phí tại đây
                    </a>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={() => setShowKeyModal(false)} className="px-5 py-2.5 text-slate-500 hover:text-slate-700 font-bold uppercase text-xs tracking-widest transition-colors">Hủy</button>
                    <button onClick={handleSaveKeyAndStart} className="px-8 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg shadow-purple-600/30 active:scale-95 transition-all uppercase text-xs tracking-widest">
                        {hasPendingFiles ? 'Lưu & Chạy ngay' : 'Lưu cấu hình'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-900 rounded-2xl text-white shadow-xl shadow-purple-900/20 flex items-center justify-center border border-white/20">
                <i className="fa-solid fa-wand-magic-sparkles text-2xl"></i>
            </div>
            <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Magic <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600">Renamer</span></h1>
                <p className="text-slate-500 text-sm mt-1 font-medium tracking-wide">Công cụ thần kỳ hệ thống hóa văn bản pháp lý</p>
            </div>
        </div>
        
        <div className="flex gap-4 items-center">
            {/* Button API Key chuyên dụng */}
            <button 
                onClick={() => {
                    setTempKey(apiKey);
                    setShowKeyModal(true);
                }}
                className={`px-4 py-2.5 rounded-xl font-bold transition-all border flex items-center gap-2 active:scale-95 uppercase text-xs tracking-widest shadow-sm ${
                    apiKey 
                    ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' 
                    : 'bg-white text-slate-500 border-slate-200 hover:text-purple-600 hover:border-purple-200'
                }`}
                title={apiKey ? "Đã nhập API Key" : "Chưa có API Key"}
            >
                <i className="fa-solid fa-key"></i>
                <span className="hidden sm:inline">{apiKey ? 'Đã có API Key' : 'Nhập API Key'}</span>
            </button>

             <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-purple-200 hover:text-purple-700 px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2.5 active:scale-95 uppercase text-xs tracking-widest shadow-sm"
            >
                <i className="fa-solid fa-plus"></i> Thêm File
            </button>

            <button 
                onClick={handleStartRenaming}
                disabled={isProcessingBatch || files.length === 0}
                className={`px-8 py-2.5 rounded-xl font-bold transition-all shadow-xl flex items-center gap-2.5 active:scale-95 uppercase text-xs tracking-widest ${
                    isProcessingBatch 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-purple-600/30 hover:shadow-purple-600/40 hover:-translate-y-0.5'
                }`}
            >
                <i className={`fa-solid ${isProcessingBatch ? 'fa-spinner animate-spin' : 'fa-bolt'}`}></i>
                {isProcessingBatch ? 'Đang thực hiện...' : 'Úm ba la đổi tên'}
            </button>
            
            {files.some(f => f.status === 'success') && (
                <button onClick={downloadAll} className="bg-slate-900 text-white px-7 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-slate-900/20 hover:bg-slate-800 flex items-center gap-2 active:scale-95 uppercase text-xs tracking-widest">
                    <i className="fa-solid fa-download"></i> Tải ZIP
                </button>
            )}
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="application/pdf,image/*" />
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Sidebar: Queue & History */}
        <div className="lg:col-span-4 flex flex-col bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden h-full">
            
            {/* Phần 1: Hàng chờ (Queue) - Chiếm phần lớn không gian nếu chưa có lịch sử, co lại nếu có */}
            <div className={`flex flex-col ${history.length > 0 ? 'h-3/5 border-b border-slate-100' : 'h-full'}`}>
                <div className="px-6 py-5 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 flex justify-between items-center uppercase text-xs tracking-widest">
                    <span className="flex items-center gap-2"><i className="fa-solid fa-layer-group text-purple-600"></i> Hàng chờ ({files.length})</span>
                    {files.length > 0 && <button onClick={() => setFiles([])} className="text-xs text-red-500 hover:text-red-700 font-bold transition-colors">Xóa hết</button>}
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                    {files.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 text-center space-y-4">
                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center">
                                <i className="fa-solid fa-cloud-arrow-up text-xl"></i>
                            </div>
                            <p className="text-xs font-medium">Chưa có file nào cần xử lý.</p>
                        </div>
                    ) : (
                        files.map(file => (
                            <div 
                                key={file.id}
                                onClick={() => setSelectedFileId(file.id)}
                                className={`p-4 rounded-2xl cursor-pointer border transition-all relative group ${
                                    selectedFileId === file.id 
                                    ? 'bg-purple-50 border-purple-200 shadow-sm' 
                                    : 'bg-white border-slate-100 hover:border-purple-100 hover:bg-slate-50'
                                }`}
                            >
                                <div className="flex items-start gap-4">
                                    {getFileIcon(file.file.type)}
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-bold truncate mb-1 ${selectedFileId === file.id ? 'text-purple-900' : 'text-slate-500'}`}>{file.file.name}</p>
                                        {file.status === 'analyzing' ? (
                                            <p className="text-sm font-bold text-purple-600 flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping"></span>
                                                AI Đang xử lý...
                                            </p>
                                        ) : (file.status === 'success' || file.status === 'renamed') ? (
                                            <p className="text-sm font-bold text-slate-900 truncate">{file.newName}</p>
                                        ) : file.status === 'error' ? (
                                            <p className="text-sm font-bold text-red-500 uppercase tracking-tighter truncate" title={file.error || ''}>
                                                Lỗi: {file.error}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">Chờ bắt đầu...</p>
                                        )}
                                    </div>
                                    <button onClick={(e) => removeFile(e, file.id)} className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><i className="fa-solid fa-trash-can text-sm"></i></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Phần 2: Lịch sử (History) - Chỉ hiện nếu có lịch sử */}
            {history.length > 0 && (
                <div className="flex-1 flex flex-col bg-slate-50/50">
                    <div className="px-6 py-3 bg-slate-100 border-b border-slate-200 font-bold text-slate-500 flex justify-between items-center uppercase text-[10px] tracking-widest">
                        <span className="flex items-center gap-2"><i className="fa-solid fa-clock-rotate-left"></i> Lịch sử ({history.length})</span>
                        <button onClick={() => setHistory([])} className="hover:text-red-500 transition-colors">Xóa</button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                         {history.slice().reverse().map(file => (
                            <div 
                                key={file.id}
                                onClick={() => setSelectedFileId(file.id)}
                                className={`p-3 rounded-xl cursor-pointer border transition-all relative flex items-center gap-3 ${
                                    selectedFileId === file.id 
                                    ? 'bg-white border-purple-300 shadow-md ring-1 ring-purple-100' 
                                    : 'bg-white/60 border-slate-200 hover:bg-white hover:border-purple-200'
                                }`}
                            >
                                <div className="text-purple-600 opacity-50 text-lg"><i className="fa-solid fa-check-circle"></i></div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-slate-400 truncate">{file.file.name}</p>
                                    <p className="text-xs font-bold text-slate-700 truncate">{file.newName}</p>
                                </div>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (file.newName) downloadFile(file.file, file.newName);
                                    }}
                                    className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                                    title="Tải xuống"
                                >
                                    <i className="fa-solid fa-download text-xs"></i>
                                </button>
                            </div>
                         ))}
                    </div>
                </div>
            )}
        </div>

        {/* Right Column: Preview & Details */}
        <div className="lg:col-span-8 flex flex-col h-full min-h-0">
            {selectedFile ? (
                 <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col h-full overflow-hidden">
                    <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
                        <span className="font-bold text-slate-700 uppercase tracking-widest text-xs flex items-center gap-2">
                            <i className="fa-solid fa-eye text-purple-500"></i> Xem chi tiết văn bản
                        </span>
                        {/* Chỉ hiện nút download riêng lẻ ở đây nếu là file lịch sử hoặc đã hoàn thành */}
                        {(selectedFile.status === 'success' || selectedFile.status === 'renamed') && selectedFile.newName && (
                            <button 
                                onClick={() => downloadFile(selectedFile.file, selectedFile.newName!)}
                                className="text-xs font-bold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <i className="fa-solid fa-download"></i> Tải file này
                            </button>
                        )}
                    </div>

                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                        <div className="md:w-1/2 bg-slate-900 flex items-center justify-center overflow-hidden relative">
                             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                             <div className="w-full h-full p-4 overflow-auto flex items-center justify-center relative z-10">
                                {selectedFile.file.type.startsWith('image/') ? (
                                    <img src={selectedFile.previewUrl} alt="Preview" className="max-h-full max-w-full object-contain rounded-lg shadow-2xl border border-white/10" />
                                ) : (
                                    <iframe src={selectedFile.previewUrl} className="w-full h-full bg-white rounded-lg shadow-lg" title="Document Preview" />
                                )}
                             </div>
                        </div>

                        <div className="md:w-1/2 p-8 overflow-y-auto space-y-6 bg-white">
                            {selectedFile.status === 'analyzing' ? (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                                    <div className="relative">
                                        <div className="w-20 h-20 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin"></div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <i className="fa-solid fa-wand-magic-sparkles text-purple-600 text-xl animate-pulse"></i>
                                        </div>
                                    </div>
                                    <p className="font-bold text-purple-800 uppercase tracking-widest text-xs">AI đang đọc văn bản...</p>
                                </div>
                            ) : (selectedFile.status === 'success' || selectedFile.status === 'renamed') && selectedFile.metadata ? (
                                <div className="space-y-6 animate-[fadeIn_0.3s]">
                                     <div>
                                        <label className="text-[10px] font-bold text-purple-600 uppercase tracking-[0.2em] block mb-2">Tên file được AI đề xuất</label>
                                        <div className="bg-slate-900 text-white p-5 rounded-2xl font-mono text-sm font-bold break-all shadow-lg shadow-purple-900/20 border border-slate-800 flex gap-3 items-start">
                                            <i className="fa-regular fa-file-code mt-1 text-purple-400"></i>
                                            {selectedFile.newName}.{selectedFile.file.name.split('.').pop()}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-wider">Ngày ban hành</p>
                                            <p className="font-bold text-slate-800 text-lg">{selectedFile.metadata.date}</p>
                                        </div>
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-wider">Số hiệu</p>
                                            <p className="font-bold text-slate-800 text-lg">{selectedFile.metadata.docNumber || 'Trống'}</p>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 tracking-wider">Cơ quan ban hành</p>
                                        <p className="font-bold text-slate-800">{selectedFile.metadata.agency}</p>
                                    </div>

                                    <div className="bg-purple-50 p-5 rounded-xl border border-purple-100">
                                        <p className="text-[10px] text-purple-600/70 font-bold uppercase mb-2 tracking-wider">Trích yếu nội dung</p>
                                        <p className="text-sm text-slate-700 leading-relaxed font-medium">"{selectedFile.metadata.summary}"</p>
                                    </div>
                                </div>
                            ) : selectedFile.status === 'error' ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-red-500">
                                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                                        <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
                                    </div>
                                    <p className="font-bold uppercase tracking-widest text-xs">{selectedFile.error}</p>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                    <i className="fa-solid fa-wand-magic-sparkles text-4xl mb-6 text-purple-200"></i>
                                    <p className="font-bold uppercase tracking-widest text-xs text-slate-400">Sẵn sàng để "úm ba la"</p>
                                </div>
                            )}
                        </div>
                    </div>
                 </div>
            ) : (
                <div className="h-full bg-slate-50 border-4 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center text-slate-400 text-center p-12 hover:bg-slate-100/50 transition-colors">
                    <div className="w-20 h-20 bg-white rounded-full shadow-sm flex items-center justify-center mb-6">
                        <i className="fa-solid fa-cloud-arrow-up text-3xl text-purple-400"></i>
                    </div>
                    <p className="font-bold text-slate-700 text-xl tracking-tight">Vui lòng chọn một văn bản</p>
                    <p className="max-w-xs mt-2 text-sm font-medium text-slate-500">AI sẽ phân tích chi tiết sau khi bạn bấm nút Úm ba la đổi tên.</p>
                </div>
            )}
        </div>
      </main>
      
      <footer className="flex-none mt-8 py-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
        <span>© 2026 MAGIC RENAMER SYSTEM</span>
        <span className="flex items-center gap-1">Powered by <span className="text-purple-600">Google Gemini 3</span></span>
      </footer>
    </div>
  );
};

export default App;
