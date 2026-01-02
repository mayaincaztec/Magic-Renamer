
// Từ điển viết tắt cơ quan (Tổ chức)
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
  "trung tâm phát triển quỹ đất": "TTPTQD", 
  "hội đồng thẩm định giá đất": "HDTDGD",
  "ban quản lý dự án": "BQLDA",
  "văn phòng đăng ký đất đai": "VPDKDD",
  "ủy ban nhân dân": "UBND", 
  "hội đồng nhân dân": "HDND"
};

// Từ điển viết tắt trích yếu (NFC chuẩn)
export const SUMMARY_MAPPING: Record<string, string> = {
  "điều chỉnh chủ trương đầu tư": "DC CTDT",
  "chủ trương đầu tư": "CTDT",
  "điều chỉnh cục bộ": "DCCB",
  "quy hoạch chi tiết": "QHCT",
  "quy hoạch chung": "QHC",
  "quy hoạch phân khu": "QHQK",
  "khu đô thị": "KDT", 
  "khu dân cư": "KDC", 
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
  "cấp phép xây dựng": "CPXD",
  "nghiệm thu": "NT",
  "tờ trình": "TTr", 
  "báo cáo": "BC", 
  "kết luận": "KL", 
  "thông báo": "TB",
  "nghị quyết": "NQ", 
  "nghị định": "ND", 
  "thông tư": "TT", 
  "quyết định": "QD"
};

/**
 * Loại bỏ dấu tiếng Việt
 */
export const removeVietnameseTones = (str: string): string => {
  if (!str) return "";
  str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  str = str.replace(/đ/g, "d").replace(/Đ/g, "D");
  return str.replace(/[!@#$%^*()+\=\[\]{};':"\\|,<>\/?]/g, "");
};

/**
 * Viết tắt tên cơ quan và địa phương
 */
export const formatAgencyName = (fullAgency: string): string => {
  const normalized = fullAgency.normalize('NFC').trim();
  const lower = normalized.toLowerCase();
  
  let agencyAbbr = "";
  let locationPart = normalized;

  // 1. Tìm tổ chức (UBND, Sở...)
  const sortedAgencyKeys = Object.keys(AGENCY_MAPPING).sort((a, b) => b.length - a.length);
  for (const key of sortedAgencyKeys) {
    const idx = lower.indexOf(key);
    if (idx !== -1) {
      agencyAbbr = AGENCY_MAPPING[key];
      locationPart = normalized.substring(idx + key.length).trim();
      break;
    }
  }

  // 2. Xử lý địa phương
  const adminLevelsRegex = /(tỉnh|thành phố|thanh pho|tp\.?|quận|quan|huyện|huyen|thị xã|thi xa|xã|xa|phường|phuong|thị trấn|thi tran)/gi;
  
  let cleanLocation = locationPart
    .replace(adminLevelsRegex, "")
    .replace(/[\s\.\-\,]+/g, " ")
    .trim();

  if (!agencyAbbr && /^(tỉnh|thành phố|tp)/i.test(normalized)) {
      cleanLocation = normalized.replace(adminLevelsRegex, "").trim();
  }

  if (cleanLocation) {
    const locationAbbr = removeVietnameseTones(cleanLocation)
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase())
      .join("");
    
    return agencyAbbr ? `${agencyAbbr} ${locationAbbr}` : locationAbbr;
  }
  
  return agencyAbbr || normalized;
};

/**
 * Viết tắt trích yếu
 */
export const formatSummary = (summary: string): string => {
  let formatted = summary.normalize('NFC').trim();
  
  // Xóa các cụm từ thừa ở đầu trích yếu
  formatted = formatted.replace(/^(về việc|về|phê duyệt|ban hành|chấp thuận)\s+/gi, "");

  const sortedKeys = Object.keys(SUMMARY_MAPPING).sort((a, b) => b.length - a.length);
  
  for (const key of sortedKeys) {
    const regex = new RegExp(key, 'gi');
    if (regex.test(formatted)) {
      formatted = formatted.replace(regex, SUMMARY_MAPPING[key]);
    }
  }
  
  return formatted;
};

/**
 * Tạo tên file hoàn chỉnh
 */
export const generateNewName = (metadata: { isDraft?: boolean, date: string, docNumber: string, agency: string, summary: string }): string => {
  const abbrSummary = formatSummary(metadata.summary);
  const finalSummary = removeVietnameseTones(abbrSummary).trim();

  const abbrAgency = formatAgencyName(metadata.agency);
  const finalAgency = removeVietnameseTones(abbrAgency).trim();

  if (metadata.isDraft) {
    const datePart = metadata.date && metadata.date.length === 8 ? metadata.date : "";
    return `[Draft] ${datePart} ${finalSummary}`.replace(/\s+/g, ' ').trim();
  }

  const cleanDocNumber = metadata.docNumber ? metadata.docNumber.replace(/\s*\/\s*/g, '/') : "";
  const legislativeMatch = cleanDocNumber.match(/^(\d+)\/(\d{4})\/([a-zA-Z0-9\.\-\u00C0-\u1EF9]+)$/);

  if (legislativeMatch) {
    const number = legislativeMatch[1];
    const year = legislativeMatch[2];
    const suffix = removeVietnameseTones(legislativeMatch[3]);
    return `${year} ${number}.${suffix} ${finalSummary}`.replace(/\s+/g, ' ').trim();
  } else {
    const numericPart = cleanDocNumber.match(/\d+/);
    const cleanNumber = numericPart ? numericPart[0] : "0000";
    return `${metadata.date} ${cleanNumber} ${finalAgency} _${finalSummary}`.replace(/\s+/g, ' ').trim();
  }
};
