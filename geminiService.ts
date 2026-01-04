
import { GoogleGenAI, Type } from "@google/genai";
import { DocumentMetadata } from "./types";

// Sử dụng model Flash Lite để tối ưu tốc độ trích xuất dữ liệu
const MODEL_NAME = "gemini-flash-lite-latest";

export const analyzeLegalDocument = async (base64Data: string, mimeType: string, userApiKey?: string): Promise<DocumentMetadata> => {
  const apiKey = userApiKey || (process.env.API_KEY as string);

  if (!apiKey) {
    throw new Error("Vui lòng nhập API Key để xử lý văn bản.");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: `Bạn là chuyên gia phân tích văn bản pháp luật Việt Nam. Hãy thực hiện BƯỚC 1: TRÍCH XUẤT THÔNG TIN theo quy tắc:
              1. **isDraft**: True nếu là văn bản DỰ THẢO, False nếu chính thức.
              2. **date**: YYYYMMDD (Ngày ban hành).
              3. **docNumber**: Số hiệu (VD: 254/2025/QH15). Để trống nếu là dự thảo không số.
              4. **agency**: Tên đầy đủ cơ quan ban hành (VD: Quốc hội).
              5. **docType**: Loại văn bản (VD: Luật, Nghị định, Nghị quyết, Thông tư, Quyết định).
              6. **summary**: Trích yếu nội dung ngắn gọn (10-15 từ). 
                 LƯU Ý: Phải giữ nguyên các động từ hành động chính như "phê duyệt", "chấp thuận", "ban hành", "quy định", "tháo gỡ", "xử phạt" ở đầu phần trích yếu.`
          }
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      // Tắt thinking budget để model phản hồi ngay lập tức không cần suy luận phức tạp
      thinkingConfig: { thinkingBudget: 0 },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isDraft: { type: Type.BOOLEAN },
          date: { type: Type.STRING },
          docNumber: { type: Type.STRING },
          agency: { type: Type.STRING },
          docType: { type: Type.STRING },
          summary: { type: Type.STRING }
        },
        required: ["isDraft", "date", "docNumber", "agency", "docType", "summary"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("AI không trả về kết quả phân tích.");
  }

  try {
    const result = JSON.parse(text);
    return {
      ...result,
      originalFileName: "",
    } as DocumentMetadata;
  } catch (error) {
    throw new Error("Phản hồi từ AI không đúng định dạng JSON.");
  }
};
