import { removeVietnameseTones } from './utils';

export const formatReceiptForNetworkPrinter = (
  sName: string,
  sAddress: string,
  sPhone: string,
  isReprint: boolean,
  invoiceNo: string,
  dateTimeStr: string,
  customerName: string,
  customerPhone: string,
  notes: string,
  items: Array<{ productName: string; quantity: number; price: number; total: number }>,
  baseTotal: number,
  discountTotal: number,
  invoiceDiscountPercent: number,
  finalTotal: number
): string => {
  const cleanShopName = removeVietnameseTones(sName).toUpperCase();
  const cleanAddress = removeVietnameseTones(sAddress);
  const cleanPhone = removeVietnameseTones(sPhone);
  const title = isReprint ? "PHIEU IN LAI" : "PHIEU THANH TOAN";
  const cleanCustomerName = removeVietnameseTones(customerName);
  const cleanNotes = removeVietnameseTones(notes);

  const centerText = (text: string) => {
    const spaces = Math.max(0, Math.floor((40 - text.length) / 2));
    return " ".repeat(spaces) + text;
  };

  const lineSeparator = "-".repeat(40);
  const doubleLineSeparator = "=".repeat(40);

  let p = "";
  p += centerText(cleanShopName) + "\n";
  p += centerText("DC: " + cleanAddress) + "\n";
  p += centerText("SDT: " + cleanPhone) + "\n";
  p += lineSeparator + "\n";
  p += centerText(title) + "\n";
  p += `So phieu: ${invoiceNo}\n`;
  p += `Thoi gian: ${dateTimeStr}\n`;
  p += `Khach hang: ${cleanCustomerName}${customerPhone ? ` (${customerPhone})` : ""}\n`;
  if (cleanNotes) {
    p += `Ghi chu: ${cleanNotes}\n`;
  }
  p += lineSeparator + "\n";

  // Columns: Ten hang (16), SL (4), D.Gia (9), T.Tien (11) = 40
  p += "Ten hang".padEnd(16) + "SL".padStart(4) + "D.Gia".padStart(9) + "T.Tien".padStart(11) + "\n";
  p += lineSeparator + "\n";

  items.forEach(item => {
    const cleanName = removeVietnameseTones(item.productName);
    const sl = item.quantity.toString();
    const dg = item.price.toLocaleString("vi-VN");
    const tt = item.total.toLocaleString("vi-VN");

    if (cleanName.length > 15) {
      p += cleanName + "\n";
      p += "".padEnd(16) + sl.padStart(4) + dg.padStart(9) + tt.padStart(11) + "\n";
    } else {
      p += cleanName.padEnd(16) + sl.padStart(4) + dg.padStart(9) + tt.padStart(11) + "\n";
    }
  });

  p += lineSeparator + "\n";

  const formatTotalRow = (label: string, value: string) => {
    const dotsCount = 40 - label.length - value.length;
    const dots = dotsCount > 0 ? ".".repeat(dotsCount) : " ";
    return label + dots + value;
  };

  p += formatTotalRow("Cong tien hang", baseTotal.toLocaleString("vi-VN") + "d") + "\n";
  if (discountTotal > 0) {
    p += formatTotalRow("Giam gia", "-" + discountTotal.toLocaleString("vi-VN") + "d") + "\n";
  }
  if (invoiceDiscountPercent > 0) {
    p += formatTotalRow("Chiet khau HD", invoiceDiscountPercent + "%") + "\n";
  }
  p += doubleLineSeparator + "\n";
  p += formatTotalRow("TONG CONG", finalTotal.toLocaleString("vi-VN") + "d") + "\n";
  p += doubleLineSeparator + "\n";

  p += "\n";
  p += centerText("Cam on Quy khach. Hen gap lai!") + "\n";
  p += "\n\n";

  return p;
};

export const getLabelPreviewText = (productName: string, price: number, shopName: string, sku?: string): string => {
  const cleanName = removeVietnameseTones(productName).toUpperCase().substring(0, 18);
  const cleanShop = removeVietnameseTones(shopName).toUpperCase();
  const safeSku = sku && sku.trim() !== "" ? sku.trim() : "12345678";
  const priceStr = price.toLocaleString("vi-VN") + " VND";

  const pad = (s: string, len: number) => {
    if (s.length >= len) return s.substring(0, len);
    return s + " ".repeat(len - s.length);
  };

  const w = 24; // width of one label in chars
  const gap = "  |  ";

  let p = "";
  p += pad(cleanShop, w) + gap + pad(cleanShop, w) + "\n";
  p += pad(cleanName, w) + gap + pad(cleanName, w) + "\n";
  p += pad("||||||||||||||||||||||", w) + gap + pad("||||||||||||||||||||||", w) + "\n";
  p += pad("       " + safeSku, w) + gap + pad("       " + safeSku, w) + "\n";
  p += pad(priceStr, w) + gap + pad(priceStr, w) + "\n";
  return p;
};

export const formatLabelForNetworkPrinter = (productName: string, price: number, shopName: string, sku?: string, quantity: number = 1): Uint8Array => {
  const cleanName = removeVietnameseTones(productName).toUpperCase().substring(0, 18);
  const cleanShop = removeVietnameseTones(shopName).toUpperCase().substring(0, 18);
  const safeSku = sku && sku.trim() !== "" ? sku.trim() : "12345678";
  const priceStr = price.toLocaleString("vi-VN") + " VND";

  let tspl = "";
  tspl += "SIZE 72 mm, 22 mm\r\n"; // Full width of a 2-column 35x22 roll (35 + 2 gap + 35)
  tspl += "GAP 2 mm, 0 mm\r\n";
  tspl += "DIRECTION 1\r\n";
  tspl += "CLS\r\n";

  // Label 1 (Left column, starting X = 16 dots / 2mm margin)
  tspl += `TEXT 16,10,"2",0,1,1,"${cleanShop}"\r\n`;
  tspl += `TEXT 16,40,"2",0,1,1,"${cleanName}"\r\n`;
  tspl += `BARCODE 16,70,"128",40,1,0,2,2,"${safeSku}"\r\n`;
  tspl += `TEXT 16,140,"2",0,1,1,"${priceStr}"\r\n`;

  // Label 2 (Right column, starting X = 16 + 280 (35mm) + 16 (2mm gap) = 312 dots)
  tspl += `TEXT 312,10,"2",0,1,1,"${cleanShop}"\r\n`;
  tspl += `TEXT 312,40,"2",0,1,1,"${cleanName}"\r\n`;
  tspl += `BARCODE 312,70,"128",40,1,0,2,2,"${safeSku}"\r\n`;
  tspl += `TEXT 312,140,"2",0,1,1,"${priceStr}"\r\n`;

  const pages = Math.max(1, Math.ceil(quantity / 2));
  tspl += `PRINT ${pages},1\r\n`;

  return new TextEncoder().encode(tspl);
};
