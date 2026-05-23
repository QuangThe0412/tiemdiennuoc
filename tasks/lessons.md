# Lessons Learned & Database Patterns

## Foreign Key Insert Constraints (FK_Mon_LoaiMon)
- **Problem**: When inserting new products, the database query hardcoded the default category ID `IDLoaiMon = 1`. In some client database configurations, ID 1 did not exist, leading to a `FOREIGN KEY constraint "FK_Mon_LoaiMon"` insert failure.
- **Solution/Pattern**: Always query the referenced foreign table (e.g., `SELECT TOP 1 IDLoaiMon FROM LoaiMon ORDER BY IDLoaiMon ASC`) to dynamically fetch the first available ID as a default value instead of hardcoding any ID, preventing violations.

## Foreign Key Insert Constraints (FK_KhachHang_LoaiKH)
- **Problem**: Similarly, when inserting new customers, the query hardcoded the customer category ID `IDLoaiKH = 1`. If ID 1 did not exist in `LoaiKH`, customer creation failed.
- **Solution/Pattern**: Query the `LoaiKH` table dynamically (`SELECT TOP 1 IDLoaiKH FROM LoaiKH ORDER BY IDLoaiKH ASC`) and use the retrieved ID as the default `IDLoaiKH` value.
