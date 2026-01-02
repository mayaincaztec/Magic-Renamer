# ✨ Magic Renamer - AI Legal Document System

Magic Renamer là một ứng dụng web và CLI mạnh mẽ, sử dụng trí tuệ nhân tạo (Google Gemini 3) để tự động hóa việc phân tích và đổi tên các văn bản pháp lý Việt Nam theo chuẩn hệ thống.

## 🚀 Tính năng chính

- **Phân tích AI:** Tự động trích xuất Ngày ban hành, Số hiệu, Cơ quan ban hành và Trích yếu nội dung từ file PDF hoặc ảnh.
- **Đổi tên thông minh:** Tự động viết tắt tên cơ quan (UBND, TTCP, BXD...) và các cụm từ pháp lý (CTDT, DCCB, QHCT...).
- **Xử lý hàng loạt:** Hỗ trợ tải lên nhiều file cùng lúc và xuất file ZIP đã đổi tên.
- **Chế độ Desktop:** Hỗ trợ đổi tên trực tiếp trên ổ cứng (khi chạy trong môi trường Electron).
- **CLI Tool:** Có sẵn công cụ dòng lệnh cho người dùng kỹ thuật.

## 🛠 Công nghệ sử dụng

- **Frontend:** React 19, Tailwind CSS, Lucide Icons.
- **AI Engine:** Google Generative AI (Gemini 3 Flash).
- **Processing:** PDF.js, JSZip.
- **Runtime:** Vite / ES Modules.

## 📦 Cài đặt & Sử dụng

### 1. Web App
Chỉ cần mở `index.html` trên trình duyệt hoặc deploy lên các nền tảng như Vercel, Firebase Hosting hoặc GitHub Pages.

### 2. CLI Tool (Dành cho nhà phát triển)
1. Cài đặt Node.js.
2. Sao chép file `.env.example` thành `.env` và điền `API_KEY` của bạn.
3. Chạy lệnh:
```bash
npm install
npm run start -- "duong/dan/file.pdf"
```

## 🔑 API Key
Bạn cần lấy API Key miễn phí tại [Google AI Studio](https://aistudio.google.com/app/apikey) để sử dụng tính năng phân tích văn bản.

## ⚖️ Giấy phép
© 2026 Magic Renamer System.
Powered by Google Gemini 3.
