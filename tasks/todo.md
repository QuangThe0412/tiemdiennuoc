# Kế hoạch Thiết kế và Phát triển: Ứng dụng Quản lý Tiệm Điện Nước (Giao diện Win 95)

Dựa trên yêu cầu và hình ảnh cung cấp, ứng dụng sẽ được đập đi xây lại với phong cách Windows 95/98 cổ điển và tập trung vào 2 màn hình chính: Bán Hàng và Danh mục Mặt hàng. Backend sẽ được chuẩn bị để kết nối với MSSQL.

## Giai đoạn 1: Thiết lập giao diện Win 95
- [x] Xóa bỏ giao diện hiện đại (thư viện icon hiện tại, CSS cũ).
- [x] Tích hợp CSS framework phong cách Win 95 (ví dụ: `98.css`) hoặc tự viết CSS tùy chỉnh cho các nút bấm (beveled borders), thanh cuộn, cửa sổ màu xám đặc trưng.
- [x] Thiết lập bố cục chính: Thanh Menu trên cùng (Hệ thống, Bán Hàng, Thu Chi, Trợ Giúp) và thanh trạng thái (Status bar) ở dưới cùng.

## Giai đoạn 2: Xây dựng Tab 1 - Màn hình Bán Hàng (POS)
- [x] Tạo thanh Toolbar (Thanh công cụ) với các nút có icon cổ điển: Tạm lưu, Thanh toán, Bán nợ, Phiếu trả hàng, Giảm %, Giảm tiền, Khách hàng, Đối tác...
- [x] Phần Header Hóa đơn: Các ô input cho Mã hóa đơn, Ngày, Khách hàng, Ghi chú...
- [x] Lưới dữ liệu (DataGrid) chính: Hiển thị các mặt hàng đang chọn trong hóa đơn (Tên, Số lượng, Đơn giá, Thành tiền...).
- [x] Lưới dữ liệu tìm kiếm (Bottom Grid): Chứa danh sách mặt hàng để tìm kiếm và thêm nhanh vào hóa đơn bằng phím tắt.
- [x] Bảng Tổng kết (Right Panel): Hiển thị Tổng cộng, Giảm giá, Còn lại, và khung hiển thị hình ảnh sản phẩm.

## Giai đoạn 3: Xây dựng Tab 2 - Danh mục Mặt Hàng (Inventory)
- [x] Tạo thanh Toolbar quản lý: Thêm, Sửa, Xóa, Gom nhóm, Xem, Import, Export...
- [x] Thanh tìm kiếm và bộ lọc nhanh.
- [x] Lưới dữ liệu (DataGrid) toàn màn hình: Hiển thị danh sách vật tư với các cột (Nhóm, Tên, Mã hàng, ĐVT, Đơn giá, Tính chất, Tồn kho...).

## Giai đoạn 4: Chuẩn bị Backend kết nối MSSQL (Rust)
- [x] Thêm các thư viện cần thiết vào `Cargo.toml` (ví dụ: `tiberius`, `tokio-util` hoặc `sqlx` để kết nối MSSQL).
- [x] Viết các hàm (Tauri commands) để khởi tạo connection pool dựa trên thông số IP, User, Pass (sẽ được cấu hình sau).
- [x] Viết các hàm mẫu (skeleton commands) để lấy danh sách mặt hàng và lưu hóa đơn từ MSSQL thay vì file JSON như hiện tại.

---
**Trạng thái:** Đã hoàn thành bộ khung giao diện và chuẩn bị Backend. Sẵn sàng nhận thông tin IP và Password để kết nối SQL.
