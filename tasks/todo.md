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
