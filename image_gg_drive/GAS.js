// CẤU HÌNH THƯ MỤC LƯU TRỮ TRÊN GOOGLE DRIVE
// Thay bằng ID thư mục của bạn (ví dụ: lấy phần mã chữ và số từ đường dẫn thư mục Drive của bạn)
var FOLDER_ID = "1x0_6BTVJhxUGh4ivki0LqZgeWFxJ-bPv"; 

// KHÓA BẢO MẬT (TOKEN) - Đổi thành mã khóa bảo mật của bạn
var SECURITY_TOKEN = "tiem_dien_nuoc_secret_key_2026"; 

// 1. NHẬN YÊU CẦU GET (Hiển thị trang chụp ảnh hoặc Thiết lập/Kiểm tra trạng thái)
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
  
  var cache = CacheService.getScriptCache();

  // Trạng thái KIỂM TRA từ máy tính (Polling) cho từng mặt hàng cụ thể hoặc phiên thường
  if (action === "check") {
    var sku = e.parameter.sku;
    var cacheKey = sku ? (session + "_uploaded_image_" + sku) : session;
    var imageUrl = cache.get(cacheKey);
    if (imageUrl) {
      cache.remove(cacheKey); // Xóa khỏi cache để tránh đọc lại ảnh cũ ở lần check tiếp theo
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

  // Yêu cầu XÓA file trên Google Drive
  if (action === "delete") {
    var fileUrl = e.parameter.url || "";
    var fileId = "";
    if (fileUrl.indexOf("/d/") !== -1) {
      var parts = fileUrl.split("/d/");
      fileId = parts[parts.length - 1];
    } else if (fileUrl.indexOf("id=") !== -1) {
      fileId = fileUrl.split("id=")[1].split("&")[0];
    }
    
    if (fileId) {
      try {
        var file = DriveApp.getFileById(fileId);
        file.setTrashed(true); // Di chuyển vào thùng rác để an toàn
        return ContentService.createTextOutput(JSON.stringify({
          status: "success",
          message: "Đã xóa file ảnh trên Drive thành công!"
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "Lỗi khi xóa file trên Drive: " + err.toString()
        })).setMimeType(ContentService.MimeType.JSON);
      }
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "Không trích xuất được File ID từ liên kết cung cấp!"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Máy tính thiết lập mặt hàng đang chọn hoạt động (set active)
  if (action === "set_active") {
    var sku = e.parameter.sku || "";
    var name = e.parameter.name || "";
    cache.put(session + "_active_sku", sku, 3600); // Lưu 1 tiếng
    cache.put(session + "_active_name", name, 3600);
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      sku: sku,
      name: name
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Hiển thị giao diện chụp ảnh cho điện thoại (iPhone)
  var html = HtmlService.createTemplateFromFile("index");
  html.session = session;
  html.token = token;
  html.sku = e.parameter.sku || "sync";
  
  return html.evaluate()
             .setTitle("Chụp Ảnh Sản Phẩm")
             .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
}

// 2. Lấy thông tin mặt hàng máy tính đang chọn
function getActiveProduct(session, token) {
  if (token !== SECURITY_TOKEN) {
    return JSON.stringify({ status: "error", message: "Token không hợp lệ!" });
  }
  var cache = CacheService.getScriptCache();
  var sku = cache.get(session + "_active_sku") || "";
  var name = cache.get(session + "_active_name") || "";
  return JSON.stringify({
    status: "success",
    sku: sku,
    name: name
  });
}

// 3. HÀM backend NHẬN UPLOAD ẢNH (Gọi trực tiếp từ HTML Client qua google.script.run)
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
    cache.put(session + "_uploaded_image_" + sku, directLink, 600); // Lưu cho chế độ đồng bộ camera
    
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
