# Kế hoạch Thực hiện - Cập nhật Giao diện & Import/Export Sản phẩm

## 1. Giao diện Tab Sản phẩm & Toolbar
- [x] Đổi text nút "Thêm" thành "**Thêm mặt hàng**".
- [x] Đổi text nút "Quản lý ĐVT" thành "**Đơn Vị Tính**".
- [x] Điều chỉnh lại giao diện phần Lọc trên Toolbar của tab Sản phẩm để hợp lý và gọn gàng hơn.

## 2. Hoàn thiện tính năng Import và Export
- [x] **Export**:
  - Xuất danh sách sản phẩm hiện tại ra định dạng file CSV chuẩn (hỗ trợ UTF-8 BOM để Excel hiển thị đúng tiếng Việt).
  - Các cột xuất ra: `Mã hàng`, `Tên M.Hàng`, `ĐVT`, `Đơn giá`, `Kho`, `Hình ảnh`, `Còn bán`.
- [x] **Import**:
  - Thêm một thẻ `<input type="file" accept=".csv" />` ẩn để người dùng chọn tệp CSV.
  - Phân tích cú pháp tệp CSV tải lên (hỗ trợ xử lý ký tự bao quanh bởi dấu ngoặc kép `"` và xuống dòng).
  - Tự động kiểm tra trùng lặp `Mã hàng` (nếu trùng mã hàng thì cập nhật thông tin mới, nếu chưa có thì thêm mới).
  - Tự động cập nhật danh sách `units` (ĐVT) nếu trong file import xuất hiện các ĐVT chưa có trong hệ thống.
  - Hiển thị thông báo tổng kết số lượng mặt hàng đã thêm mới và số lượng mặt hàng được cập nhật.

## 3. Hệ thống Lưu trữ & Cấu hình CSDL MSSQL
- [x] Lưu trữ cấu hình hệ thống (zoom, MSSQL credentials) dưới dạng tệp `setting.json` tại thư mục AppData/AppConfig của ứng dụng.
- [x] Cập nhật giao diện Modal Cấu hình Hệ thống:
  - Thêm hiển thị đường dẫn tệp `setting.json` và nút "**📁 Mở thư mục**" để mở thư mục lưu cấu hình.
  - Thêm form nhập thông tin cấu hình kết nối MSSQL (Server IP/Name, Database, Tài khoản, Mật khẩu).
  - Thêm nút "**🔌 Kiểm tra kết nối**" kèm hiển thị phản hồi kết quả trực quan (Thành công/Thất bại).
- [x] Đồng bộ hóa tải/lưu cấu hình giữa giao diện (React) và backend (Rust/Tauri commands).

## 4. Tích hợp Dữ liệu MSSQL Thực tế
- [x] Đọc và ghi dữ liệu mặt hàng thông qua bảng `Mon` và `AnhMon` (dạng `varbinary`).
- [x] Đọc và ghi thông tin khách hàng thông qua bảng `KhachHang` và lịch sử công nợ `CongNoKH`.
- [x] Thiết lập nút Khóa/Mở khóa kết nối CSDL trong bảng cấu hình hệ thống.
- [x] Điều chỉnh nút Kiểm tra kết nối hoạt động trong cả hai trạng thái Khóa (block) và Mở khóa (unblock).
- [x] Loại bỏ hoàn toàn dữ liệu mockup cũ (`initialProducts` và `initialCustomers`) để ứng dụng sử dụng 100% dữ liệu thực từ CSDL khi kết nối thành công, hoặc khởi tạo danh sách trống nếu chưa kết nối.

## 5. Kiểm thử & Xác nhận
- [x] Chạy build kiểm tra lỗi biên dịch TypeScript.
- [x] Dùng subagent browser để thực hiện xác thực giao diện cấu hình và tính năng kiểm tra kết nối MSSQL.
- [x] Xác thực xóa bỏ dữ liệu mockup thành công.
