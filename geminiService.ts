
import { GoogleGenAI, Type } from "@google/genai";
import { DocumentMetadata } from "./types";

const MODEL_NAME = "gemini-3-flash-preview";

/**
 * Phân tích tài liệu pháp lý sử dụng Gemini AI để trích xuất metadata.
 * @param base64Data Dữ liệu file dưới dạng base64
 * @param mimeType Định dạng file (MIME type)
 * @param userApiKey API Key người dùng cung cấp (nếu có)
 * @returns Metadata trích xuất từ văn bản
 */
// Fix: A function whose declared type is neither 'undefined', 'void', nor 'any' must return a value.
export const analyzeLegalDocument = async (base64Data: string, mimeType: string, userApiKey?: string): Promise<DocumentMetadata> => {
  const apiKey = userApiKey || (process.env.API_KEY as string);

  if (!apiKey) {
    throw new Error("Vui lòng nhập API Key để xử lý văn bản.");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  // Cấu hình tham số cho mô hình generateContent
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [
      {
        parts: [
          {
            // Fix: No value exists in scope for the shorthand property 'data'. Provide 'data: base64Data'.
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: `Bạn là chuyên gia phân tích văn bản pháp luật Việt Nam. Hãy trích xuất thông tin chính xác từ tài liệu đính kèm để phục vụ việc đặt tên file.
              1. **isDraft**: True nếu là DỰ THẢO (thường có tiêu đề là Dự thảo), False nếu là văn bản chính thức.
              2. **date**: YYYYMMDD (Ngày ban hành hoặc ngày ghi trên bản dự thảo).
              3. **docNumber**: Số hiệu văn bản (ví dụ: 12/2024/TT-BXD). Nếu là bản dự thảo và không có số hiệu, hãy để trống.
              4. **agency**: Tên đầy đủ của cơ quan ban hành văn bản.
              5. **summary**: Trích yếu nội dung ngắn gọn (khoảng 10-15 từ), ưu tiên sử dụng các thuật ngữ viết tắt ngành luật phổ biến.`
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
  });

  // Truy cập text trực tiếp từ response object (không dùng text())
  const text = response.text;
  if (!text) {
    throw new Error("AI không trả về kết quả phân tích.");
  }

  try {
    const result = JSON.parse(text);
    // Trả về dữ liệu khớp với interface DocumentMetadata
    return {
      ...result,
      originalFileName: "", // Sẽ được cập nhật ở phía ứng dụng nếu cần
    } as DocumentMetadata;
  } catch (error) {
    console.error("Lỗi phân tích JSON từ Gemini:", error);
    throw new Error("Phản hồi từ AI không đúng định dạng yêu cầu.");
  }
};
