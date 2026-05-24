ID Folder: 1x0_6BTVJhxUGh4ivki0LqZgeWFxJ-bPv
------------------
Deployment ID: AKfycbwDGheFNcJLu7LpbR_fybU7kK6lH4VQJI7oQo9QjZYUfY4j0FMlkEjA-HZjCL-rGfLUEA
---------------
Web App URL: https://script.google.com/macros/s/AKfycbwDGheFNcJLu7LpbR_fybU7kK6lH4VQJI7oQo9QjZYUfY4j0FMlkEjA-HZjCL-rGfLUEA/exec
----------------
Secret Key: tiem_dien_nuoc_secret_key_2026

------------------------
## TÍNH NĂNG CHỤP ẢNH HÀNG LOẠT (OPTIMIZED FLOW)

Để tối ưu hóa việc chụp 100+ mặt hàng liên tục, hệ thống đã được cập nhật cơ chế **Đồng bộ trạng thái thời gian thực giữa Máy tính và Điện thoại** (Active Product Sync):

### Điểm cải tiến:
1. **Quét QR duy nhất 1 lần:** Điện thoại của bạn chỉ cần quét QR một lần duy nhất để kết nối (hoặc lưu Bookmark trình duyệt trên iPhone). Bạn có thể mở nó bất kỳ lúc nào để bắt đầu chụp.
2. **Tự động nhận diện mặt hàng:** Khi bạn Click chọn bất kỳ mặt hàng nào trên danh sách sản phẩm ở máy tính, giao diện trên iPhone của bạn sẽ ngay lập tức tự động đổi tên hiển thị sang sản phẩm đó!
3. **Tự động lưu (Zero-click save):** Bạn chỉ cần bấm "Chụp ảnh" rồi bấm "Tải lên máy tính" từ điện thoại. Máy tính sẽ tự động nhận ảnh mới, lưu trực tiếp vào database SQL Server và cập nhật hình ảnh trên bảng danh sách sản phẩm ngay lập tức! Bạn không cần nhấn bất kỳ nút Lưu hay mở Modal nào trên máy tính.

---

### Các bước cập nhật Google Apps Script mới:
Vì có cập nhật các hàm đồng bộ mới ở cả file code (`GAS.js`) và giao diện chụp ảnh (`index.html`), bạn vui lòng cập nhật lại Apps Script của bạn:

1. Truy cập vào dự án [Google Apps Script](https://script.google.com/) của bạn.
2. Mở file mã lệnh (ví dụ `Code.gs`) và dán toàn bộ nội dung mới từ file [GAS.js](file:///d:/CODE/tiemdiennuoc/image_gg_drive/GAS.js).
3. Mở file HTML (ví dụ `index.html`) và dán toàn bộ nội dung mới từ file [index.html](file:///d:/CODE/tiemdiennuoc/image_gg_drive/index.html).
4. Nhấn nút **Deploy** (Triển khai) -> **Manage Deployments** -> Click vào biểu tượng bút chì để sửa -> Chọn **Version: New Version** -> Bấm **Deploy**.
5. Đóng ứng dụng Tauri cũ, khởi động lại ứng dụng mới bằng lệnh `npm run tauri dev`.
6. Vào tab **Sản phẩm**, nhấn nút **Chụp hàng loạt iPhone** trên thanh công cụ để mở bảng điều khiển và quét mã kết nối.