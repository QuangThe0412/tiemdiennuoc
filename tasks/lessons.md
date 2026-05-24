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

## Database Image URL Storage vs Binary BLOB
- **Problem**: Storing high-resolution photos directly in the database as binary bytes (BLOB) causes severe database size inflation over time (phình database).
- **Solution/Pattern**: Add a string `URL` column to the image table (e.g. `AnhMon`). When an external link (e.g., Google Drive direct link) is uploaded, store the URL string in the `URL` column and keep/set the binary column (`AnhMon`) to `NULL`. Fall back to loading base64 from binary only if the `URL` column is empty, ensuring backward compatibility with local file uploads.

## SQL Server Database Backups & Permission Isolation
- **Problem**: Running `BACKUP DATABASE` requires the SQL Server service account (which runs as a background Windows user) to have write access to the target path. It cannot write directly to a user's private AppData folder (where `setting.json` resides).
- **Solution/Pattern**: Run the backup command targeting a universally accessible server path (such as `C:\Users\Public\`), then use Rust's file system API to copy the file to the local AppData directory and delete the temporary server file. This handles local databases perfectly and works around OS-level permission restrictions.

## Safe Database Initialization & Alter Scripts
- **Problem**: Running schema updates directly can crash if columns already exist or if referenced tables are missing.
- **Solution/Pattern**: Always query metadata schemas first (e.g., `INFORMATION_SCHEMA.TABLES` and `INFORMATION_SCHEMA.COLUMNS`) to conditionally run `CREATE TABLE` or `ALTER TABLE ADD COLUMN` statements, preventing runtime crashes and SQL execution failures.

## Google Drive Image Preview & Referrer Handling
- **Problem**: Modern web browsers/Tauri WebViews block certain cross-origin direct download requests or require specific cookies/security context for Google Drive direct file links (`lh3.googleusercontent.com/d/`), causing images to not load (broken images).
- **Solution/Pattern**: Define an `onError` event handler on `<img>` tags that dynamically fallbacks to alternative public link formats if the main format fails. Fallback pipeline:
  1. `https://lh3.googleusercontent.com/d/{FILE_ID}`
  2. `https://drive.google.com/uc?export=view&id={FILE_ID}`
  3. `https://drive.google.com/thumbnail?id={FILE_ID}&sz=w1000` (uses Google's high-speed CDN thumbnail cache).

## Synced Image Cloud Deletion
- **Solution/Pattern**: Add a lightweight HTTP endpoint (e.g. `action=delete` in Apps Script web app) that accepts a file URL/ID, extracts the file ID, and uses the server-side API (`DriveApp.getFileById(id).setTrashed(true)`) to safely trash the file. Trigger this API call asynchronously from client side whenever a product is deleted or its image is replaced/removed.

## Unified Real-time Hardware/Camera Polling Integration
- **Problem**: Maintaining separate session keys and polling states for "single-item image capture" and "batch capture" creates race conditions, duplicate API endpoints, and confusing UX.
- **Solution/Pattern**: Merge into a single, global Camera Sync session (using a persistent session ID stored in settings). When Camera Sync is enabled, the desktop app polls for whatever product is currently active/selected. If the user snaps a photo on their phone, the background listener updates the product and dynamically feeds the new image URL to any open modal preview (e.g., matching the currently editing product ID), unifying both workflows into one state loop.

## Contextual Modal-Centric Device Sync (No Sidebar Panel Required)
- **Problem**: Showing a persistent sidebar with a QR code and manual connection toggles clutters the UI. On the other hand, embedding a small QR code with instructions in a single-column modal feels cramped.
- **Solution/Pattern**: Remove all main-screen sidebar panels. Use a balanced, wider (600px) two-column layout in the modal. Place the local preview and manual URL tools on the left, and the large QR code (140px+) with structured instructions on the right. Automatically handle connection routing and polling upon modal open/close. This maximizes scanning reliability while keeping the instructions clean and separate.

## Managing Unsaved Cloud Session Files during Multi-shot Polling
- **Problem**: In camera sync workflows, images snapped on a mobile device are uploaded immediately to cloud storage. If the user shoots multiple times, clicks "Delete Image" without saving, or cancels the edit modal, these intermediate uploaded files become orphaned and remain in the cloud folder indefinitely.
- **Solution/Pattern**:
  1. Maintain a session array (`sessionUploadedImages`) in state to track all files uploaded during the current modal lifetime.
  2. Only commit changes to the local DB upon clicking "Save" (removing the active save from the background polling loop).
  3. When a new image is received, automatically delete the previous unsaved session image.
  4. If the user clicks "Delete Image", immediately trash the file from the cloud backend.
  5. If the user cancels or closes the modal, iterate over the session array and trash all unsaved files. Clear the session array upon save/cancel.




