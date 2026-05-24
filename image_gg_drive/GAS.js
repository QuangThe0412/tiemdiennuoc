// CẤU HÌNH THƯ MỤC LƯU TRỮ TRÊN GOOGLE DRIVE
// Thay bằng ID thư mục của bạn (ví dụ: lấy phần mã chữ và số từ đường dẫn thư mục Drive của bạn)
var FOLDER_ID = "1x0_6BTVJhxUGh4ivki0LqZgeWFxJ-bPv";

// KHÓA BẢO MẬT (TOKEN) - Đổi thành mã khóa bảo mật của bạn
var SECURITY_TOKEN = "tiem_dien_nuoc_secret_key_2026";

// 1. NHẬN YÊU CẦU GET (Hiển thị trang chụp ảnh hoặc Kiểm tra trạng thái)
function doGet(e) {
  var action = e.parameter.action;
  var session = e.parameter.session;
  var token = e.parameter.token;

  // Kiểm tra tính hợp lệ của token
  if (token !== SECURITY_TOKEN) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Khóa bảo mật (token) không hợp lệ!"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // Trạng thái KIỂM TRA từ máy tính (Polling)
  if (action === "check") {
    var cache = CacheService.getScriptCache();
    var imageUrl = cache.get(session);
    if (imageUrl) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        imageUrl: imageUrl
      })).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: "pending",
        message: "Đang đợi điện thoại tải ảnh lên..."
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Hiển thị giao diện chụp ảnh cho điện thoại (iPhone)
  var html = HtmlService.createTemplateFromFile("index");
  html.session = session;
  html.token = token;
  html.sku = e.parameter.sku || "Mặt hàng";

  return html.evaluate()
    .setTitle("Chụp Ảnh Sản Phẩm")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
}

// 2. HÀM backend NHẬN UPLOAD ẢNH (Gọi trực tiếp từ HTML Client qua google.script.run)
function uploadImageFromPhone(dataJson) {
  try {
    var data = JSON.parse(dataJson);
    var token = data.token;
    var session = data.session;
    var sku = data.sku || "unknown";
    var base64Data = data.image; // Chuỗi base64 đã nén

    // Kiểm tra token bảo mật
    if (token !== SECURITY_TOKEN) {
      return JSON.stringify({
        status: "error",
        message: "Token bảo mật không chính xác!"
      });
    }

    // Tạo folder lưu trữ nếu chưa cấu hình
    var folder;
    if (FOLDER_ID && FOLDER_ID !== "YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE") {
      folder = DriveApp.getFolderById(FOLDER_ID);
    } else {
      var folders = DriveApp.getFoldersByName("TiemDienNuoc_Images");
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder("TiemDienNuoc_Images");
      }
    }

    // Chuyển đổi base64 thành file ảnh
    var contentType = "image/jpeg";
    var decodedData = Utilities.base64Decode(base64Data.split(",")[1]);
    var blob = Utilities.newBlob(decodedData, contentType, "IMG_" + sku + "_" + session + ".jpg");

    // Lưu vào Drive
    var file = folder.createFile(blob);

    // Thiết lập phân quyền CHỈ XEM (VIEW) công khai cho file ảnh này để ứng dụng lấy được link
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Tạo đường dẫn ảnh hiển thị trực tiếp (Direct Link)
    var fileId = file.getId();
    var directLink = "https://lh3.googleusercontent.com/d/" + fileId;

    // Lưu link ảnh vào Script Cache trong 10 phút để máy tính lấy về
    var cache = CacheService.getScriptCache();
    cache.put(session, directLink, 600); // Lưu 10 phút

    return JSON.stringify({
      status: "success",
      imageUrl: directLink
    });

  } catch (err) {
    return JSON.stringify({
      status: "error",
      message: err.toString()
    });
  }
}
