# Kế hoạch Thực hiện - Tiếp tục Tinh chỉnh Tab Sản phẩm (Mặt hàng)

## 1. Đồng bộ chọn dòng khi sửa ảnh
- [x] Cập nhật onClick của ô "Hình ảnh" ở cả chế độ được chọn (isSelected) và chưa được chọn (not isSelected). Khi click vào ô này để mở modal, gọi thêm `setSelectedProduct(p)` để đảm bảo dòng đó cũng được chọn.

## 2. Ảnh chỉ dùng URL (Không dùng Base64)
- [x] Gỡ bỏ hàm `handleImageFileChange`.
- [x] Gỡ bỏ nút "Chọn ảnh từ máy tính" và input file ẩn trong modal `imageEditProduct`.
- [x] Đảm bảo preview hình ảnh hoạt động dựa trên link URL thuần.

## 3. Đổi nhãn nút từ "Ghi lại" thành "Lưu"
- [x] Đổi text "Ghi lại" thành "Lưu" trong modal thêm/sửa sản phẩm (`editForm` modal).
- [x] Đổi text "Ghi lại" thành "Lưu" trong modal sửa ảnh (`imageEditProduct` modal).

## 4. Hiển thị màu xám nhạt cho sản phẩm ngừng bán
- [x] Trong bảng Sản phẩm, kiểm tra nếu `p.available === false` thì áp dụng style hoặc class màu chữ xám nhạt (ví dụ `#777` và background `#f2f2f2`) để dễ nhận biết.

## 5. Kích hoạt nút Export hoạt động
- [x] Tìm hiểu logic nút Export sản phẩm hiện tại trong `App.tsx`.
- [x] Triển khai hàm xuất danh sách sản phẩm thành tệp CSV thông qua Tauri Command `save_file_to_downloads` (lưu trực tiếp vào thư mục Downloads).

## 6. Thêm nút Download Template
- [x] Thêm nút "Tải mẫu" (Download template) kế bên nút Import/Export trong tab Sản phẩm.
- [x] Khi click vào, tạo một file CSV mẫu chứa một dòng mẫu sẵn (Mã hàng, Tên hàng, ĐVT, Đơn giá, Đơn giá 2, Còn bán, Kho) và tải xuống máy người dùng thông qua Tauri Command `save_file_to_downloads`.

## 7. Kiểm tra biên dịch & hoạt động
- [x] Sửa lỗi khóa ngoại `FK_Mon_LoaiMon` bằng cách query tự động IDLoaiMon đầu tiên từ DB.
- [x] Biên dịch kiểm tra thành công.

## 8. Cập nhật theo phản hồi mới nhất (23/05/2026)
- [x] Đặt mặc định hiển thị hóa đơn từ ngày đầu tháng đến ngày hiện tại.
- [x] Khắc phục lỗi khóa ngoại `FK_HoaDon_DoiTac` bằng cách tự động truy vấn và sử dụng `IDDoiTac` đầu tiên từ bảng `DoiTac` (cùng với `IDNguoiDung` từ `NguoiDung`).
- [x] Đổi nhãn nút "Đóng" trong modal in/xem trước hóa đơn thành "OK".

## 9. Cấu hình bảng AnhMon thêm cột URL và cập nhật backend
- [x] Truy vấn và phân tích cột `URL` trong `fetch_products_db` (nếu không trống thì sử dụng trực tiếp, nếu trống/null thì fall back về byte nhị phân base64).
- [x] Lưu trực tiếp liên kết URL vào cột `URL` trong `save_product_db` (thiết lập cột `AnhMon` nhị phân thành `NULL` để tiết kiệm dung lượng database).

## 10. Thêm tính năng Backup DB và Fix Init DB
- [x] Thêm lệnh `backup_database` trong backend Rust để tạo file `.bak` lưu về thư mục chứa file `setting.json` (thư mục app_data_dir) với tên định dạng `yyyyMMdd_nameDB.bak` (sử dụng chrono).
- [x] Thêm lệnh `fix_init_db` trong backend Rust tự động kiểm tra và chạy `ALTER TABLE` thêm cột `URL` vào `AnhMon` nếu chưa có.
- [x] Thêm 2 nút bấm tương ứng trong Modal cấu hình kết nối CSDL phía Frontend với xác nhận confirm tùy chỉnh khi bấm backup.
- [x] Sửa nút backup hiển thị modal confirm tùy chỉnh (customConfirm modal) đồng nhất với style giao diện thay vì dùng confirm native của trình duyệt.
- [x] Sử dụng `SERVERPROPERTY('InstanceDefaultBackupPath')` để lấy thư mục lưu trữ mặc định của SQL Server (tránh lỗi phân quyền ghi file).

## 11. Cải tiến cơ chế hiển thị Preview ảnh và Đồng bộ Xóa trên Google Drive (24/05/2026)
- [x] Tạo cơ chế hiển thị Preview ảnh thông minh có fallback tự động khi link `lh3.googleusercontent.com` lỗi/chặn (thử qua `drive.google.com/uc` và `drive.google.com/thumbnail`).
- [x] Thêm endpoint `delete` trong Google Apps Script (`GAS.js`) để xóa file ảnh trên Drive (cho vào thùng rác để giải phóng dung lượng thư mục).
- [x] Cập nhật giao diện máy tính gọi API xóa ảnh trên Drive khi người dùng click xóa hình ảnh hoặc xóa sản phẩm (đã định tuyến qua lệnh Tauri Rust `delete_drive_image_rust` để vượt qua lỗi CORS của trình duyệt đối với redirect 302 của Apps Script).
- [x] Đồng nhất cơ chế chụp hàng loạt và chụp đơn lẻ thành một hệ thống đồng bộ duy nhất sử dụng session và polling tự động bên trong modal "Hình ảnh mặt hàng" (đã xóa bỏ hoàn toàn cột QR bên ngoài).
- [x] Theo dõi danh sách ảnh được tải lên trong phiên chỉnh sửa hiện tại (`sessionUploadedImages`) để tự động dọn dẹp các ảnh nháp/ảnh chưa lưu trên Google Drive khi:
  - Chụp ảnh mới (tự động xóa ảnh cũ vừa chụp trước đó để tránh rác thư mục).
  - Nhấp nút "Xóa ảnh" trên giao diện (xóa ngay lập tức trên Drive).
  - Đóng/Hủy modal sửa ảnh (tự động xóa toàn bộ ảnh nháp chưa lưu).
  - Nhấp "Lưu" (chỉ giữ lại ảnh cuối cùng, tự động xóa các ảnh nháp trung gian khác).
- [x] Cố định kích thước `width`, `minWidth`, `maxWidth` ở mức `200px` cho khung ảnh sản phẩm (`pos-image-panel`) bên tab Bán hàng nhằm triệt tiêu hiện tượng xê dịch/thay đổi chiều rộng cột danh sách khi chuyển đổi giữa các dòng có ảnh và không có ảnh.
- [x] Tích hợp sự kiện cuộn chuột (`onWheel`) và con trỏ điều chỉnh `cursor: 'ew-resize'` trên khung ảnh sản phẩm bên tab Bán hàng để người dùng có thể dễ dàng tăng/giảm kích thước rộng của khung ảnh từ 100px đến 600px một cách nhanh chóng và tự nhiên.







