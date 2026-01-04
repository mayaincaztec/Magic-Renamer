
import { RenamingMode, DocumentMetadata } from './types';

export const AGENCY_MAPPING: Record<string, string> = {
  "thanh tra chính phủ": "TTCP", 
  "văn phòng chính phủ": "VPCP", 
  "quốc hội": "QH", 
  "chính phủ": "CP",
  "bộ xây dựng": "BXD", 
  "bộ tài chính": "BTC", 
  "bộ tài nguyên và môi trường": "BTNMT",
  "bộ nông nghiệp và phát triển nông thôn": "BNNPTNT", 
  "bộ kế hoạch và đầu tư": "BKHDT", 
  "bộ giáo dục và đào tạo": "BGDDT", 
  "bộ y tế": "BYT",
  "bộ nội vụ": "BNV", 
  "bộ tư pháp": "BTP", 
  "bộ lao động thương binh và xã hội": "BLDTBXH",
  "bộ văn hóa thể thao và du lịch": "BVHTTDL",
  "bộ thông tin và truyền thông": "BTTTT", 
  "bộ khoa học và công nghệ": "BKHCN",
  "bộ giao thông vận tải": "BGTVT", 
  "bộ công thương": "BCT", 
  "bộ ngoại giao": "BNG",
  "bộ công an": "BCA", 
  "bộ quốc phòng": "BQP",
  "sở xây dựng": "SXD", 
  "sở tài chính": "STC", 
  "sở nông nghiệp và phát triển nông thôn": "SNNPTNT", 
  "sở tài nguyên và môi trường": "STNMT",
  "sở quy hoạch kiến trúc": "SQHKT", 
  "sở giao thông vận tải": "SGTVT", 
  "sở công thương": "SCT", 
  "sở kế hoạch và đầu tư": "SKHDT",
  "sở giáo dục và đào tạo": "SGDDT", 
  "sở y tế": "SYT", 
  "sở nội vụ": "SNV", 
  "sở tư pháp": "STP",
  "sở lao động thương binh và xã hội": "SLDTBXH", 
  "sở văn hóa thể thao và du lịch": "SVHTTDL", 
  "sở thông tin và truyền thông": "STTTT",
  "sở khoa học và công nghệ": "SKHCN",
  "ủy ban nhân dân": "UBND", 
  "hội đồng nhân dân": "HDND"
};

export const DOC_TYPE_MAPPING: Record<string, string> = {
  "luật": "Luat",
  "nghị quyết": "NQ",
  "nghị định": "ND",
  "thông tư": "TT",
  "quyết định": "QD",
  "chỉ thị": "CT",
  "kế hoạch": "KH",
  "thông báo": "TB",
  "công văn": "CV"
};

export const SUMMARY_MAPPING: Record<string, string> = {
  "chủ trương đầu tư": "CTDT",
  "điều chỉnh cục bộ": "DCCB",
  "quy hoạch chi tiết": "QHCT",
  "quy hoạch chung": "QHC",
  "quy hoạch phân khu": "QHQK",
  "khu đô thị": "KDT", 
  "khu dân cư": "KDC", 
  "khu nhà ở": "KNO",
  "sửa đổi bổ sung": "SDBS", 
  "sửa đổi, bổ sung": "SDBS",
  "quyền sử dụng đất": "QSDD", 
  "sử dụng đất": "SDD",
  "hình thành trong tương lai": "HTTTL", 
  "chủ đầu tư": "CDT",
  "kết luận thanh tra": "KLTT",
  "phương án kiến trúc": "PAKT", 
  "giải phóng mặt bằng": "GPMB",
  "tái định cư": "TDC",
  "giấy phép xây dựng": "GPXD",
  "hạ tầng kỹ thuật": "HTKT",
  "tờ trình": "TTr", 
  "báo cáo": "BC", 
  "kết luận": "KL", 
  "nghị quyết": "NQ", 
  "nghị định": "ND", 
  "thông tư": "TT", 
  "quyết định": "QD"
};

export const sanitizeString = (str: string): string => {
  if (!str) return "";
  str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  str = str.replace(/đ/g, "d").replace(/Đ/g, "D");
  return str.replace(/[*:"?\/\\|<>]/g, "").replace(/\s+/g, " ").trim();
};

export const formatAgencyName = (fullAgency: string): string => {
  const normalized = fullAgency.normalize('NFC').trim();
  const lower = normalized.toLowerCase();
  let agencyAbbr = "";
  let locationPart = normalized;

  const sortedAgencyKeys = Object.keys(AGENCY_MAPPING).sort((a, b) => b.length - a.length);
  for (const key of sortedAgencyKeys) {
    const idx = lower.indexOf(key);
    if (idx !== -1) {
      agencyAbbr = AGENCY_MAPPING[key];
      locationPart = normalized.substring(idx + key.length).trim();
      break;
    }
  }

  const adminLevelsRegex = /(tỉnh|thành phố|thanh pho|tp\.?|quận|quan|huyện|huyen|thị xã|thi xa|xã|xa|phường|phuong|thị trấn|thi tran)/gi;
  let cleanLocation = locationPart.replace(adminLevelsRegex, "").replace(/[\s\.\-\,]+/g, " ").trim();

  if (cleanLocation) {
    const locationAbbr = sanitizeString(cleanLocation).split(/\s+/).map(w => w.charAt(0).toUpperCase()).join("");
    return agencyAbbr ? `${agencyAbbr} ${locationAbbr}` : locationAbbr;
  }
  return agencyAbbr || normalized;
};

export const formatSummary = (summary: string): string => {
  let formatted = summary.normalize('NFC').trim();
  formatted = formatted.replace(/^(về việc|về)\s+/gi, "");
  const sortedKeys = Object.keys(SUMMARY_MAPPING).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    const regex = new RegExp(key, 'gi');
    formatted = formatted.replace(regex, SUMMARY_MAPPING[key]);
  }
  return sanitizeString(formatted);
};

export const generateNewName = (metadata: DocumentMetadata, mode: RenamingMode = 'standard'): string => {
  const finalSummary = formatSummary(metadata.summary);
  const finalAgency = sanitizeString(formatAgencyName(metadata.agency));
  const dateStr = metadata.date || "";
  
  // Xử lý số hiệu
  const cleanDocNumber = metadata.docNumber ? metadata.docNumber.replace(/\s*\/\s*/g, '/') : "";
  const legislativeMatch = cleanDocNumber.match(/^(\d+)\/(\d{4})\/([a-zA-Z0-9\.\-]+)$/);

  let resultName = "";

  // Chế độ 2: Văn bản Luật/Nghị định/Thông tư
  if (mode === 'legislative' && !metadata.isDraft) {
    const number = legislativeMatch ? legislativeMatch[1] : (cleanDocNumber.match(/\d+/) ? cleanDocNumber.match(/\d+/)![0] : "00");
    const year = legislativeMatch ? legislativeMatch[2] : dateStr.substring(0, 4);
    
    // Tìm mã loại văn bản (NQ, ND, TT...)
    const lowerType = metadata.docType.toLowerCase();
    let typeAbbr = "";
    for (const key in DOC_TYPE_MAPPING) {
      if (lowerType.includes(key)) {
        typeAbbr = DOC_TYPE_MAPPING[key];
        break;
      }
    }
    
    // Cấu trúc: YYYY [Số] [Cơ quan] _[Loại VB] [Trích yếu]
    resultName = `${year} ${number} ${finalAgency} _${typeAbbr} ${finalSummary}`.replace(/\s+/g, ' ').trim();
  }
  // Chế độ 1: Văn bản pháp lý thông thường (Mặc định)
  else if (legislativeMatch && !metadata.isDraft) {
    // Mẫu chuẩn pháp quy nếu có số hiệu đầy đủ
    const number = legislativeMatch[1];
    const year = legislativeMatch[2];
    const suffix = sanitizeString(legislativeMatch[3]);
    resultName = `${year} ${number}.${suffix} ${finalSummary}`.trim();
  } else {
    // Mẫu thông thường: YYYYMMDD Số Cơ_quan _Trích_yếu
    const numericPart = cleanDocNumber.match(/\d+/);
    const cleanNumber = numericPart ? numericPart[0] : "00";
    const draftPrefix = metadata.isDraft ? "[Draft] " : "";
    resultName = `${draftPrefix}${dateStr} ${cleanNumber} ${finalAgency} _${finalSummary}`.trim();
  }

  // Loại bỏ dấu chấm ở cuối cùng trong tên file (nếu có)
  return resultName.replace(/\.+$/, "").trim();
};
