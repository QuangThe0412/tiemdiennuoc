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

## Giai đoạn 5: Chỉnh sửa Giao diện (UI Tweaks)
- [x] Chuyển group tính toán (Tổng cộng, Giảm, Còn, Đã gồm VAT) xuống nằm chung hàng với lưới Mặt hàng được chọn.
- [x] Khu vực cũ của group tính toán thay bằng Image panel.
- [x] Cập nhật kiểu dữ liệu `Product` thêm trường `link` để hiển thị ảnh. Nếu không có `link`, hiển thị ảnh mặc định là dấu X màu đỏ ở giữa.
- [x] Thêm cột "Xóa" sau cột VAT ở lưới mặt hàng được chọn để xóa dòng.
- [x] Thêm nút "Tính tiền" (Checkout) ở dưới group tính toán.
- [x] Xóa cột VAT%.
- [x] Cho phép chỉnh sửa số lượng, đơn giá, KM% trực tiếp trên lưới mặt hàng được chọn.
- [x] Tô màu nền xám nhẹ cho các cột không được phép chỉnh sửa để dễ phân biệt.

## Giai đoạn 6: Tinh chỉnh Layout & Phím tắt
- [x] Chuyển Image Panel xuống phần danh sách mặt hàng chưa chọn (bottom grid).
- [x] Căn lề nút Tính tiền xuống sát đáy (bottom) của khung chứa.
- [x] Dọn dẹp thanh Search: Bỏ text, input SL(F11), bỏ checkbox Nhập đơn giá, bỏ nút Sửa số lượng.
- [x] Thêm logic nhấn ESC để focus tự động vào ô Search Mã/tên.

## Giai đoạn 7: Tùy chỉnh kích thước và vị trí Grid & Image
- [x] Tăng chiều cao lưới Mặt hàng được chọn và thêm tính năng kéo thả (resize vertical) để điều chỉnh độ cao linh hoạt.
- [x] Chuyển Image Panel sang bên phải của lưới tìm kiếm mặt hàng (bottom grid).
- [x] Thiết lập Image Panel co giãn theo chiều cao với min-width cố định.

## Giai đoạn 8: Thanh kéo thả (Splitter) chia vùng
- [x] Xóa bỏ CSS `resize: vertical` cũ vì chỉ có handle nhỏ.
- [x] Thêm một thanh kéo ngang (resizer) giữa lưới trên và lưới dưới.
- [x] Cài đặt logic kéo thả (drag & drop) bằng React để thay đổi chiều cao mượt mà.

## Giai đoạn 9: Cải thiện Trải nghiệm Chọn & Hiển thị Item
- [x] Thêm tính năng quét khối chọn nhiều dòng (multi-select) và highlight dòng đã chọn ở lưới Mặt hàng đã chọn.
- [x] Hiển thị tên của item đang chọn ở dưới phần Image Panel.
- [x] Đồng bộ chọn Item: Bất kể click ở lưới trên hay dưới đều hiển thị đúng ảnh và tên của item đó.

## Giai đoạn 10: Tinh chỉnh Thao tác & Xóa Mặt hàng
- [x] Khắc phục lỗi màu text bị chìm (khó nhìn) ở các ô readonly khi dòng được highlight.
- [x] Hủy bỏ logic quét khối chọn nhiều mặt hàng, chỉ giữ lại chọn 1 mặt hàng (single select).
- [x] Thêm logic tự động xóa mặt hàng khỏi giỏ: Nhấn phím Delete hoặc khi sửa số lượng về 0.

## Giai đoạn 11: Cải thiện Search & Header
- [x] Hỗ trợ phím Enter: Nhấn Enter tại ô Search (phục vụ quét mã vạch) hoặc tại dòng tìm kiếm sẽ tự động thêm mặt hàng vào giỏ.
- [x] Mở rộng ô search "Mã/tên" và cho phép tìm kiếm theo cả mã SKU lẫn Tên.
- [x] Bổ sung các cột Header còn thiếu ở phần mặt hàng đã chọn (Mã Hàng, ĐVT).

## Giai đoạn 12: Tìm kiếm tiếng Việt không dấu (Accent-insensitive)
- [x] Thêm hàm tiện ích `removeAccents` để chuẩn hóa chuỗi tiếng Việt.
- [x] Cập nhật bộ lọc tìm kiếm tại ô nhập POS và bảng kết quả khớp cả khi không gõ dấu.
- [x] Cập nhật bộ lọc tìm kiếm tương tự cho phần Danh mục sản phẩm (Inventory).

## Giai đoạn 13: Cải tiến phím ESC & nút Tìm kiếm
- [x] Thiết lập logic lắng nghe ESC nâng cao:
  - Lần nhấn ESC thứ nhất: Focus ô Search, nếu đã có text thì tiến hành bôi đen (select).
  - Lần nhấn ESC thứ hai liên tiếp (trong 500ms): Clear dữ liệu ô Search.
- [x] Thêm nút "Tìm" kiểu Win95 bên cạnh ô Search.

## Giai đoạn 14: Định dạng nút Tìm kiếm (.classic-btn)
- [x] Tạo class `.classic-btn` kiểu nổi 3D cổ điển trong `App.css`.
- [x] Áp dụng class `.classic-btn` cho nút "Tìm" trong `App.tsx`.

## Giai đoạn 15: Thiết kế lại Khu vực Thông tin Hóa đơn (Top section)
- [x] Thêm các class `.classic-fieldset` và `.form-label-fixed` vào `App.css`.
- [x] Thay thế panel hóa đơn cũ bằng 3 fieldset chia cột logic: Thông tin phiếu, Khách hàng & Ghi chú, và Khuyến mãi hóa đơn.

## Giai đoạn 16: Hộp thoại Sửa Thông tin Mặt hàng (Edit Modal)
- [x] Định nghĩa các class cho Dialog Win95 (`.modal-overlay`, `.classic-dialog`, `.dialog-title-bar`, `.dialog-body`, `.dialog-buttons`) trong `App.css`.
- [x] Khai báo state `editingProduct`, `editForm` và hàm xử lý cập nhật dữ liệu `handleSaveProductEdit` trong `App.tsx`.
- [x] Thêm cột "Sửa" bên cạnh cột "Đơn giá" trong bảng danh sách tìm kiếm dưới (Bottom Grid).
- [x] Render hộp thoại dialog cho phép chỉnh sửa Mã hàng, Tên, ĐVT, Đơn giá và lưu lại vào State (cập nhật cả Cart và mặt hàng đang chọn).

## Giai đoạn 17: Cấu hình Menu Tab & Modal Thu phóng (Zoom Config Modal)
- [x] Khai báo state `isSystemModalOpen` và `zoom` (lưu trữ trong `localStorage`) trong `App.tsx`.
- [x] Cập nhật Menu Bar: Xóa "Thu Chi" và "Trợ Giúp", đổi tên "Danh mục" thành "Sản phẩm", và gán sự kiện click cho "Hệ thống".
- [x] Thiết kế Modal "Cấu hình Hệ thống" cho phép tùy chỉnh Zoom phần trăm giao diện, lưu cấu hình và đóng.

## Giai đoạn 18: Tối ưu vị trí Tab Hệ thống & Tăng cường Responsive khi Zoom
- [x] Cập nhật thanh Menu Bar: Di chuyển tab "Hệ thống" về phía bên phải bằng thẻ spacer.
- [x] Cập nhật CSS `.toolbar` trong `App.css` hỗ trợ `flex-wrap: wrap` để tránh tràn nút khi zoom.
- [x] Cấu hình `.pos-top-section` hỗ trợ `flex-wrap: wrap` và thiết lập `minWidth` cho từng fieldset.
- [x] Thay đổi chiều rộng cố định của ô nhập Tìm kiếm thành kích thước co giãn (flex-basis với max-width).

## Giai đoạn 19: Xử lý sự kiện ESC đóng Modal & Tối ưu hóa Thu phóng 200%
- [x] Cập nhật Keyboard Listener trong `App.tsx`: Bấm ESC khi có modal hiển thị sẽ đóng modal đó và dừng xử lý.
- [x] Thiết lập dependency array cho `useEffect` keyboard listener để tránh lỗi closure state.
- [x] Cấu hình CSS `body` hỗ trợ `overflow: auto`.
- [x] Thiết lập `min-width: 1000px` và `min-height: 650px` cho `.app-container` để đảm bảo hiển thị đủ nội dung khi zoom lên 200%.

## Giai đoạn 20: Giữ Modal Luôn Giữa Màn Hình Khi Zoom & Cuộn Trang
- [x] Cấu hình CSS cho `.modal-overlay` sử dụng `top: 0; left: 0; right: 0; bottom: 0` và `display: flex`.
- [x] Thêm `margin: auto` cho `.classic-dialog` để căn giữa tuyệt đối và cuộn an toàn trong Flexbox.
- [x] Thêm `useEffect` trong `App.tsx` để vô hiệu hóa scroll của `body` (`overflow: 'hidden'`) khi bất kỳ modal nào mở ra.

## Giai đoạn 21: Tinh chỉnh cơ chế Thu phóng Kính lúp (Adaptive Kiosk Zoom)
- [x] Khôi phục CSS `body { overflow: hidden }` để chặn thanh cuộn ngoài cửa sổ.
- [x] Gỡ bỏ `min-width` và `min-height` của `.app-container` trong `App.css`.
- [x] Cập nhật `useEffect` thu phóng trong `App.tsx`: Tính toán lại `width` và `height` của `.app-container` bằng công thức `calc(100vw / Z)` để luôn full screen không tràn.
- [x] Điều chỉnh lại giới hạn kéo giãn chiều cao `middleHeight` theo tỉ lệ zoom trong mousemove handler.

## Giai đoạn 22: Thống kê Tiền giảm giá & Thêm cột Tiền giảm ở mỗi Item
- [x] Định nghĩa các hàm phụ trợ mới trong `App.tsx`: `getCartBaseTotal` (tổng tiền chưa giảm), `getCartDiscountTotal` (tổng tiền giảm), `getCartFinalTotal` (thực thu).
- [x] Cập nhật bảng Giỏ hàng: Thêm cột `Tiền Giảm` nằm sau cột `Km%` và điều chỉnh lại độ rộng các cột.
- [x] Hiển thị số tiền được giảm của từng item bằng công thức `amount * (discount / 100)`.
- [x] Cập nhật hàng trống phụ mô phỏng (empty rows) thêm một thẻ `td` để không lệch cột.
- [x] Cập nhật Panel tổng cộng: Xóa bỏ dòng `ĐÃ GỒM VAT`, hiển thị đúng giá trị `TỔNG CỘNG`, `GIẢM`, và `CÒN`.

## Giai đoạn 23: Tinh giản Toolbar & Loại bỏ Khuyến mãi Hóa đơn
- [x] Cập nhật Toolbar trong `App.tsx`: Gỡ bỏ các nút "Thanh toán(F2)", "Phiếu trả hàng", "Giảm %(F5)", "Giảm tiền(F6)", "Khách hàng(F7)", "Đối tác(F8)". Chỉ giữ lại "Tạm lưu(F1)", "Bán nợ(F3)", và "HĐ tạm lưu(F9)".
- [x] Loại bỏ nhóm fieldset "Khuyến mãi hóa đơn" trong `pos-top-section`.
- [x] Căn chỉnh lại `flex` và `minWidth` của hai fieldset còn lại để phủ đều phần trống trên cùng.

## Giai đoạn 24: Di chuyển các nút Action lên Menu Bar nằm cạnh Hệ thống
- [x] Gỡ bỏ hoàn toàn thẻ `.toolbar` khỏi khu vực bán hàng (`App.tsx`).
- [x] Di chuyển 3 nút "Tạm lưu(F1)", "Bán nợ(F3)", "HĐ tạm lưu(F9)" lên `.menu-bar`.
- [x] Thiết kế chúng dưới dạng `.menu-item` kèm icon và tên để đồng bộ với menu hệ thống.
- [x] Bổ sung thanh phân tách đứng giữa các nút chức năng này và mục "Hệ thống".

## Giai đoạn 25: Tối ưu hóa UI Panel Tổng cộng (Visual Hierarchy)
- [x] Định nghĩa các class CSS mới trong `App.css`: `.total-row-sub` (cộng tiền hàng), `.total-row-discount` (giảm giá), và `.total-row-final` (tổng cộng) với kiểu dáng phân cấp rõ ràng.
- [x] Cập nhật cấu trúc HTML của Totals Panel trong `App.tsx` để sử dụng các class CSS mới này.
- [x] Chuyển nhãn hàng đầu tiên thành "Cộng tiền hàng".
- [x] Thêm tiền tố dấu trừ `-` trước số tiền chiết khấu trong dòng Giảm giá.
- [x] Thay đổi nhãn dòng cuối cùng thành "Tổng cộng".

## Giai đoạn 26: Trải nghiệm Nhập liệu POS - Bôi đen thông minh & Giới hạn giá trị
- [x] Cập nhật CSS trong `App.css`: Chuyển màu chữ của `.total-row-discount` thành màu xanh lam (`var(--text-blue)`) và `.total-row-final` thành màu đỏ (`var(--text-red)`).
- [x] Cập nhật hàm `updateCartItem` trong `App.tsx`: Ngăn chặn số âm (`Math.max(0, value)`) cho tất cả thay đổi, đồng thời khống chế khuyến mãi (`Km%`) tối đa là 99.
- [x] Thêm sự kiện `onFocus={(e) => e.target.select()}` cho tất cả các ô nhập liệu số và văn bản có thể sửa đổi để tự động bôi đen toàn bộ ký tự khi focus.

## Giai đoạn 27: Hoàn thiện logic Tạm lưu, Bán nợ, Khách hàng & Dropdown Search
- [x] Tạo các interface `Customer` và `PendingInvoice` lưu trữ cấu trúc dữ liệu khách hàng & hóa đơn tạm lưu.
- [x] Cập nhật Tab Menu Bar: Thêm tab "Khách hàng" bên cạnh tab "Sản phẩm", thay đổi kiểu dữ liệu `activeTab` để cho phép hiển thị tab mới.
- [x] Tạo bộ lọc tìm kiếm khách hàng dạng dropdown có thể search tại POS. Khi click chọn, cập nhật thông tin khách hàng và tự động cập nhật text ô nhập.
- [x] Triển khai tab quản lý "Khách hàng" với đầy đủ bảng thông tin và toolbar Win95: Thêm KH, Sửa KH, Xóa KH, Thu nợ khách hàng (cập nhật số dư nợ).
- [x] Thực thi đầy đủ phím tắt phím chức năng F1 (Tạm lưu hóa đơn), F3 (Bán nợ), F9 (Xem hóa đơn tạm lưu) và F2 (Thanh toán).
- [x] Cài đặt ESC lắng nghe thông minh cho tất cả các modal overlay mới để đóng khi người dùng nhấn thoát.

## Giai đoạn 28: Chuyển đổi Logic Nhóm sang Quản lý Đơn vị tính & Cấu trúc lại bảng sản phẩm
- [ ] Thay thế hoàn toàn logic nhóm hàng (categories) thành logic quản lý đơn vị tính (units).
  - Đổi tên state `categories` thành `units` (hoặc khởi tạo `units` làm danh sách các ĐVT hợp lệ).
  - Đổi nút "Quản lý nhóm" thành "Quản lý ĐVT". Khi click mở modal "Quản lý đơn vị tính" để thêm, sửa, xóa ĐVT.
  - Cập nhật bộ lọc ở POS và danh sách Sản phẩm thành bộ lọc theo ĐVT.
- [ ] Cấu trúc lại lưới sản phẩm (Inventory Grid):
  - Cột 1: **Hình ảnh** (Thay thế cột Nhóm). Hiển thị hình thu nhỏ (thumbnail) từ `p.link`. Nếu không có, hiển thị biểu tượng ảnh trống. Khi click chọn/chỉnh sửa dòng, có thể nhập text link URL ảnh trực tiếp.
  - Cột 2: **Mã hàng** (Mã hàng được kéo lên trước).
  - Cột 3: **Tên M.Hàng**.
  - Cột 4: **ĐVT** (Ô select chọn ĐVT có sẵn trong danh sách `units`).
  - Cột 5: **Đơn giá**.
  - Cột 6: **Đ.giá 2** (Giữ nguyên).
  - Cột 7: **Còn bán** (Trạng thái checkbox/☑, bỏ cột Tính chất MH).
  - Cột 8: **Kho** (Tồn kho của sản phẩm `p.stock`, thay thế cột tồn tối thiểu và bỏ cột Ghi chú).
  - Cột 9: **Xóa** (Nút xóa).
