
import 'dotenv/config'; // Load biến môi trường từ file .env
import { GoogleGenAI, Type } from "@google/genai";
import * as fs from 'fs';
import * as path from 'path';
import { generateNewName } from './sharedUtils.js'; // Import logic dùng chung

// --- 1. CONFIG & UTILS ---

// Sử dụng model 3-flash-preview cho tác vụ text cơ bản theo khuyến nghị
const MODEL_NAME = "gemini-3-flash-preview"; 
const MAX_FILE_SIZE_MB = 20; // Giới hạn file gửi lên API

// --- 2. MAIN CLI LOGIC ---

const analyzeAndRename = async (filePath: string) => {
  // Chuẩn hóa đường dẫn file
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File không tồn tại: ${absolutePath}`);
    return;
  }

  const stats = fs.statSync(absolutePath);
  if (stats.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    console.warn(`⚠️  Bỏ qua ${path.basename(absolutePath)}: File quá lớn (> ${MAX_FILE_SIZE_MB} MB).`);
    return;
  }

  console.log(`\n🔄 Đang xử lý: ${path.basename(absolutePath)}...`);

  try {
    const fileBuffer = fs.readFileSync(absolutePath);
    const base64Data = fileBuffer.toString('base64');
    const ext = path.extname(absolutePath).toLowerCase();
    
    // MIME Type: Gemini hỗ trợ PDF và Image trực tiếp
    let mimeType = 'application/pdf';
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) mimeType = `image/${ext.replace('.', '')}`;

    // Fix: Ensure process.env.API_KEY is treated as string and accessed via process.env
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    const params = {
      model: MODEL_NAME,
      contents: [
        {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            {
              text: `Bạn là chuyên gia phân tích văn bản pháp luật Việt Nam. Hãy trích xuất thông tin chính xác để đổi tên file.
              1. **isDraft**: True nếu là DỰ THẢO.
              2. **date**: YYYYMMDD (Ngày ban hành hoặc ngày dự thảo).
              3. **docNumber**: Số hiệu (VD: 12/2024/TT-BXD). Nếu Draft thì để trống.
              4. **agency**: Cơ quan ban hành (Đầy đủ).
              5. **summary**: Trích yếu (Ngắn gọn 10-15 từ, ưu tiên viết tắt ngành luật).`
            }
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isDraft: { type: Type.BOOLEAN },
            date: { type: Type.STRING },
            docNumber: { type: Type.STRING },
            agency: { type: Type.STRING },
            summary: { type: Type.STRING }
          },
          required: ["isDraft", "date", "docNumber", "agency", "summary"],
        },
      },
    };

    let retries = 5;
    let delay = 5000;
    let response;

    while (true) {
        try {
            response = await ai.models.generateContent(params);
            break;
        } catch (error: any) {
             let errString = "";
             try { errString = JSON.stringify(error, null, 2); } catch (e) { errString = String(error); }

             const rawError = error?.error || error;
             const errorCode = rawError?.code || rawError?.status;

             const isQuotaError = 
                errorCode === 429 || 
                errorCode === 'RESOURCE_EXHAUSTED' ||
                errString.includes('"code":429') ||
                errString.includes('RESOURCE_EXHAUSTED') ||
                errString.includes('quota');

             const isHardQuota = errString.includes('exceeded your current quota') || rawError?.message?.includes('exceeded your current quota');
             
             if (retries > 0 && isQuotaError && !isHardQuota) {
                 console.log(`⏳ Quota exceeded (${path.basename(absolutePath)}). Waiting ${delay/1000}s...`);
                 await new Promise(r => setTimeout(r, delay));
                 retries--;
                 delay *= 2;
                 continue;
             }
             if (isQuotaError) {
                 throw new Error("QUOTA_EXCEEDED");
             }
             throw error;
        }
    }

    const result = JSON.parse(response.text || "{}");
    // Sử dụng logic tạo tên từ file sharedUtils
    const newFileNameBase = generateNewName(result);
    
    const dir = path.dirname(absolutePath);
    const newPath = path.join(dir, `${newFileNameBase}${ext}`);

    // Kiểm tra trùng tên
    if (newPath === absolutePath) {
        console.log(`⚠️  Tên file đã đúng chuẩn, bỏ qua.`);
        return;
    }
    
    if (fs.existsSync(newPath)) {
         console.error(`❌ Không thể đổi tên: File đích đã tồn tại (${newFileNameBase}${ext})`);
         return;
    }

    // Thực hiện đổi tên file trực tiếp trên ổ cứng
    fs.renameSync(absolutePath, newPath);
    console.log(`✅ Đã đổi tên thành: ${newFileNameBase}${ext}`);

  } catch (error: any) {
    if (error.message === 'QUOTA_EXCEEDED') {
        console.error(`❌ Lỗi xử lý file ${path.basename(absolutePath)}: Bạn đã hết hạn ngạch API (Quota).`);
        console.error(`👉 Vui lòng kiểm tra tại: https://aistudio.google.com/app/plan_information`);
    } else {
        const msg = error.message || JSON.stringify(error);
        console.error(`❌ Lỗi xử lý file ${path.basename(absolutePath)}:`, msg);
    }
  }
};

// --- 3. ENTRY POINT ---

const main = async () => {
  // Fix: Cast process to any to avoid "Property 'argv' does not exist on type 'Process'" error
  const args = (process as any).argv.slice(2);
  
  if (args.length === 0) {
    console.log("\nCách sử dụng:");
    console.log("1. Mở terminal tại thư mục này.");
    console.log("2. Chạy lệnh: npx tsx cli.ts \"đường/dẫn/đến/file.pdf\"");
    console.log("   (Hoặc kéo thả file vào cửa sổ terminal sau khi gõ lệnh)");
    return;
  }

  console.log("🚀 Bắt đầu xử lý...");
  
  for (const file of args) {
    await analyzeAndRename(file);
  }
  
  console.log("\n✨ Hoàn tất!");
};

main();
