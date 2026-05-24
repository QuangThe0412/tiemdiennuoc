export const removeAccents = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
};

export const getFormattedDate = (date: Date) => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

export const getFormattedTime = (date: Date) => {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
};

export const removeVietnameseTones = (str: string): string => {
  str = str.normalize("NFC");
  const VI_MAP: Record<string, string> = {
    'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
    'ă': 'a', 'ắ': 'a', 'ặ': 'a', 'ằ': 'a', 'ẳ': 'a', 'ẵ': 'a',
    'ấ': 'a', 'ầ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a',
    'ạ': 'a', 'ả': 'a',
    'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
    'Ă': 'A', 'Ắ': 'A', 'Ặ': 'A', 'Ằ': 'A', 'Ẳ': 'A', 'Ẵ': 'A',
    'Ấ': 'A', 'Ầ': 'A', 'Ậ': 'A', 'Ẩ': 'A', 'Ẫ': 'A',
    'Ạ': 'A', 'Ả': 'A',
    'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
    'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
    'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e',
    'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
    'Ề': 'E', 'Ế': 'E', 'Ệ': 'E', 'Ể': 'E', 'Ễ': 'E',
    'Ẹ': 'E', 'Ẻ': 'E', 'Ẽ': 'E',
    'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
    'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
    'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
    'Ị': 'I', 'Ỉ': 'I', 'Ĩ': 'I',
    'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
    'ọ': 'o', 'ỏ': 'o',
    'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O',
    'Ồ': 'O', 'Ố': 'O', 'Ộ': 'O', 'Ổ': 'O', 'Ỗ': 'O',
    'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ợ': 'O', 'Ở': 'O', 'Ỡ': 'O',
    'Ọ': 'O', 'Ỏ': 'O',
    'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
    'ụ': 'u', 'ủ': 'u', 'ũ': 'u',
    'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
    'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ự': 'U', 'Ử': 'U', 'Ữ': 'U',
    'Ụ': 'U', 'Ủ': 'U', 'Ũ': 'U',
    'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
    'Ỳ': 'Y', 'Ý': 'Y', 'Ỵ': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y',
    'đ': 'd', 'Đ': 'D',
    'ñ': 'n', 'Ñ': 'N', 'ç': 'c', 'Ç': 'C',
  };
  str = str.replace(/[^\x00-\x7F]/g, (ch) => VI_MAP[ch] ?? '?');
  return str;
};

export const formatVND = (amount: number) => {
  return amount.toLocaleString("vi-VN");
};

export const isRetailCustomer = (name: string): boolean => {
  const nameLower = removeAccents(name.toLowerCase());
  return nameLower.includes("khach le") || nameLower.includes("khach hang le");
};

