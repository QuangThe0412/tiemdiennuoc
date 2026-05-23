# Lessons Learned & Database Patterns

## Foreign Key Insert Constraints (FK_Mon_LoaiMon)
- **Problem**: When inserting new products, the database query hardcoded the default category ID `IDLoaiMon = 1`. In some client database configurations, ID 1 did not exist, leading to a `FOREIGN KEY constraint "FK_Mon_LoaiMon"` insert failure.
- **Solution/Pattern**: Always query the referenced foreign table (e.g., `SELECT TOP 1 IDLoaiMon FROM LoaiMon ORDER BY IDLoaiMon ASC`) to dynamically fetch the first available ID as a default value instead of hardcoding any ID, preventing violations.

## Foreign Key Insert Constraints (FK_KhachHang_LoaiKH)
- **Problem**: Similarly, when inserting new customers, the query hardcoded the customer category ID `IDLoaiKH = 1`. If ID 1 did not exist in `LoaiKH`, customer creation failed.
- **Solution/Pattern**: Query the `LoaiKH` table dynamically (`SELECT TOP 1 IDLoaiKH FROM LoaiKH ORDER BY IDLoaiKH ASC`) and use the retrieved ID as the default `IDLoaiKH` value.

## Foreign Key Insert Constraints (FK_HoaDon_DoiTac)
- **Problem**: When inserting new invoice records, inserting a hardcoded `IDDoiTac = 0` caused a constraint failure if ID 0 did not exist in the `DoiTac` table.
- **Solution/Pattern**: Automatically query `DoiTac` (and `NguoiDung` to prevent user constraint failures) to obtain the first available valid IDs (`SELECT TOP 1 IDDoiTac FROM DoiTac ORDER BY IDDoiTac ASC`), using them as dynamic default values during query execution.

## Foreign Key Insert Constraints (FK_HoaDon_KhachHang)
- **Problem**: The frontend's "Khách lẻ" placeholder has local `id='1'`, mapping to `customerId=1`. But the real `KhachHang` table may not have `IDKhachHang=1`, causing an FK violation on insert.
- **Solution/Pattern**: In Rust, run a `COUNT(1)` check first in a dedicated inner scope. If count == 0, fall back with `SELECT TOP 1 IDKhachHang FROM KhachHang ORDER BY IDKhachHang ASC`. Always insert `resolved_customer_id`, never the raw frontend value.

## Rust Borrow-Checker: Sequential tiberius QueryStream Queries
- **Problem**: `Result<QueryStream<'_>, _>` holds a mutable borrow of `client` until the whole `Result` is dropped. Doing two `.query()` calls on `client` in the same scope fails with E0499.
- **Solution/Pattern**: Isolate each query in its own `{ }` inner scope. Store only a primitive result outside (e.g., `i32`, `bool`), not the stream or Result. The borrow is released when the inner scope closes, freeing `client` for the next query.

## serde_json: Parsing JSON Numbers vs Strings
- **Problem**: The frontend sends `productId` as a JSON **number** (e.g., `{"productId": 5}`). In Rust, `item["productId"].as_str()` returns `None` for number values. The fallback `"0"` then parses as `Ok(0)` — so `unwrap_or_else` never runs and every product ID silently becomes `0`, causing `FK_ChiTietHD_Mon` violations.
- **Solution/Pattern**: Always use the correct `serde_json` accessor for the expected type. For numbers, use `.as_i64()` or `.as_f64()` directly — **never** `.as_str()` then parse. For values that could be either type, try the numeric accessor first.
  - ✅ `item["productId"].as_i64().unwrap_or(0) as i32`
  - ❌ `item["productId"].as_str().unwrap_or("0").parse::<i32>()` — silently returns 0 for number values
## Tauri Command Argument Naming: camelCase ↔ snake_case
- **Problem**: Frontend sends `invoiceCode: value` but Rust command expects parameter `invoice_code_query`. Tauri maps the frontend JS object key (camelCase) → Rust parameter name (snake_case). If the key name doesn't match exactly after conversion, Tauri throws `missing required key`.
- **Rule**: The frontend JS key must be the **exact camelCase equivalent** of the Rust snake_case parameter name.
  - Rust param: `invoice_code_query` → Frontend key must be: `invoiceCodeQuery`
  - Rust param: `from_date` → Frontend key must be: `fromDate`
  - ❌ `invoiceCode:` → won't match `invoice_code_query`
  - ✅ `invoiceCodeQuery:` → correctly maps to `invoice_code_query`
