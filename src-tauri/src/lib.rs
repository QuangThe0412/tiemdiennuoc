use std::fs;
use tauri::State;
use tokio::sync::Mutex;
use tiberius::{Client, Config, AuthMethod};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

struct DbState {
    pub connected: bool,
}

fn to_base64(bytes: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut buf = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let n = match chunk.len() {
            3 => ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | (chunk[2] as u32),
            2 => ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8),
            1 => (chunk[0] as u32) << 16,
            _ => unreachable!(),
        };
        buf.push(CHARSET[((n >> 18) & 63) as usize] as char);
        buf.push(CHARSET[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            buf.push(CHARSET[((n >> 6) & 63) as usize] as char);
        } else {
            buf.push('=');
        }
        if chunk.len() > 2 {
            buf.push(CHARSET[(n & 63) as usize] as char);
        } else {
            buf.push('=');
        }
    }
    buf
}

fn from_base64(s: &str) -> Option<Vec<u8>> {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let s_clean: String = s.chars().filter(|&c| !c.is_whitespace() && c != '=').collect();
    let bytes = s_clean.as_bytes();
    
    let mut output = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0;
    
    for &b in bytes {
        let val = ALPHABET.iter().position(|&x| x == b)? as u32;
        buffer = (buffer << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push(((buffer >> bits) & 255) as u8);
        }
    }
    Some(output)
}

#[tauri::command]
async fn connect_db(state: State<'_, Mutex<DbState>>, ip: &str, _pass: &str) -> Result<String, String> {
    let mut db = state.lock().await;
    db.connected = true;
    Ok(format!("Đã sẵn sàng kết nối tới {}", ip))
}

#[tauri::command]
async fn check_db_status(state: State<'_, Mutex<DbState>>) -> Result<bool, String> {
    let db = state.lock().await;
    Ok(db.connected)
}

#[tauri::command]
fn load_app_data(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join("data.json");
    if !path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_app_data(app: tauri::AppHandle, data: String) -> Result<(), String> {
    use tauri::Manager;
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    let path = app_dir.join("data.json");
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_config_path(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join("setting.json");
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join("setting.json");
    if !path.exists() {
        return Ok("{}".to_string());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: String) -> Result<(), String> {
    use tauri::Manager;
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    let path = app_dir.join("setting.json");
    fs::write(path, settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_config_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&app_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&app_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&app_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn get_mssql_config(server: &str, db_name: &str, user: &str, pass: &str) -> Config {
    let mut config = Config::new();
    let server = server.trim();
    let mut host = server.to_string();
    let mut port = 1433;
    
    if let Some(pos) = server.find(',') {
        let h = server[..pos].trim().to_string();
        let p_str = server[pos + 1..].trim();
        if let Ok(p) = p_str.parse::<u16>() {
            host = h;
            port = p;
        }
    } else if let Some(pos) = server.find(':') {
        let h = server[..pos].trim().to_string();
        let p_str = server[pos + 1..].trim();
        if let Ok(p) = p_str.parse::<u16>() {
            host = h;
            port = p;
        }
    }
    
    config.host(&host);
    config.port(port);
    config.database(db_name);
    config.authentication(AuthMethod::sql_server(user, pass));
    config.encryption(tiberius::EncryptionLevel::NotSupported);
    config
}

#[tauri::command]
async fn test_mssql_connection(server: String, db_name: String, user: String, pass: String) -> Result<String, String> {
    if server.trim().is_empty() || user.trim().is_empty() {
        return Err("Thiếu thông tin cấu hình (Server IP hoặc Tài khoản)!".to_string());
    }
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    
    let tcp = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        TcpStream::connect(config.get_addr())
    ).await
    .map_err(|_| "Không thể kết nối mạng TCP tới máy chủ SQL (timeout 3s)".to_string())?
    .map_err(|e| format!("Lỗi kết nối TCP: {}", e))?;
    
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    
    let _client = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        Client::connect(config, tcp.compat_write())
    ).await
    .map_err(|_| "Timeout kết nối xác thực SQL Server (timeout 3s)".to_string())?
    .map_err(|e| format!("Lỗi đăng nhập/xác thực CSDL: {}", e))?;
    
    Ok(format!("Kết nối thành công tới Database '{}' trên Server '{}'!", db_name, server))
}

#[tauri::command]
async fn fetch_products_db(server: String, db_name: String, user: String, pass: String) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    let stream = client.simple_query("
        SELECT 
            m.IDMon, 
            m.TenMon, 
            m.MaTat, 
            m.DVTMon, 
            CAST(m.DonGiaHT AS FLOAT) as DonGiaHT, 
            CAST(m.DonGiaHT2 AS FLOAT) as DonGiaHT2, 
            CAST(m.DonGiaVon AS FLOAT) as DonGiaVon, 
            CAST(m.TonKhoTT AS FLOAT) as TonKhoTT, 
            m.Active, 
            a.AnhMon 
        FROM Mon m 
        LEFT JOIN AnhMon a ON m.IDMon = a.IDMon
    ").await.map_err(|e| e.to_string())?;
    
    let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
    
    let mut products_json = Vec::new();
    for row in rows {
        let id: i32 = row.get("IDMon").unwrap_or(0);
        let name: &str = row.get("TenMon").unwrap_or("");
        let sku: &str = row.get("MaTat").unwrap_or("");
        let unit: &str = row.get("DVTMon").unwrap_or("");
        
        let price: f64 = row.get::<f64, _>("DonGiaHT").unwrap_or(0.0);
        let price2: f64 = row.get::<f64, _>("DonGiaHT2").unwrap_or(0.0);
        let cost: f64 = row.get::<f64, _>("DonGiaVon").unwrap_or(0.0);
        let min_stock: f64 = row.get::<f64, _>("TonKhoTT").unwrap_or(0.0);
        let active: bool = row.get("Active").unwrap_or(true);
        
        let image_bytes: Option<&[u8]> = row.get("AnhMon");
        let image_base64 = image_bytes.map(|b| format!("data:image/jpeg;base64,{}", to_base64(b))).unwrap_or_default();
        
        let p = serde_json::json!({
            "id": id,
            "sku": sku,
            "name": name,
            "unit": unit,
            "price": price,
            "price2": price2,
            "cost": cost,
            "stock": min_stock,
            "link": image_base64,
            "available": active
        });
        products_json.push(p);
    }
    
    Ok(serde_json::to_string(&products_json).unwrap())
}

#[tauri::command]
async fn save_product_db(
    server: String, 
    db_name: String, 
    user: String, 
    pass: String,
    product: String
) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    let p: serde_json::Value = serde_json::from_str(&product).map_err(|e| e.to_string())?;
    let id = p["id"].as_i64().unwrap_or(0) as i32;
    let sku = p["sku"].as_str().unwrap_or("");
    let name = p["name"].as_str().unwrap_or("");
    let unit = p["unit"].as_str().unwrap_or("");
    let price = p["price"].as_f64().unwrap_or(0.0);
    let price2 = p["price2"].as_f64().unwrap_or(0.0);
    let cost = p["cost"].as_f64().unwrap_or(0.0);
    let stock = p["stock"].as_f64().unwrap_or(0.0);
    let active = p["available"].as_bool().unwrap_or(true);
    let img_base64 = p["link"].as_str().unwrap_or("");
    
    let img_bytes = if img_base64.starts_with("data:image/") {
        if let Some(pos) = img_base64.find(",") {
            from_base64(&img_base64[(pos + 1)..])
        } else {
            None
        }
    } else {
        None
    };
    
    let mut target_id = id;
    
    if target_id <= 0 {
        let query = client.query("SELECT IDMon FROM Mon WHERE MaTat = @P1", &[&sku]).await.map_err(|e| e.to_string())?;
        let row = query.into_row().await.map_err(|e| e.to_string())?;
        if let Some(r) = row {
            target_id = r.get("IDMon").unwrap_or(0);
        }
    }
    
    if target_id > 0 {
        client.execute("
            UPDATE Mon 
            SET TenMon = @P1, DVTMon = @P2, DonGiaHT = @P3, DonGiaHT2 = @P4, DonGiaVon = @P5, TonKhoTT = @P6, Active = @P7
            WHERE IDMon = @P8
        ", &[&name, &unit, &price, &price2, &cost, &stock, &active, &target_id]).await.map_err(|e| e.to_string())?;
    } else {
        let mut loai_mon_id = 1;
        let query_loai = client.query("SELECT TOP 1 IDLoaiMon FROM LoaiMon ORDER BY IDLoaiMon ASC", &[]).await.map_err(|e| e.to_string())?;
        let row_loai = query_loai.into_row().await.map_err(|e| e.to_string())?;
        if let Some(r) = row_loai {
            loai_mon_id = r.get("IDLoaiMon").unwrap_or(1);
        }

        let query = client.query("
            INSERT INTO Mon (IDLoaiMon, TenMon, TenKhongDau, MaTat, DVTMon, DonGiaHT, DonGiaHT2, DonGiaVon, TonKhoTT, VAT, ThoiGianBH, GhiChu, Active, TinhChatMon)
            OUTPUT INSERTED.IDMon
            VALUES (@P1, @P2, @P2, @P3, @P4, @P5, @P6, @P7, @P8, 0, 0, '', @P9, 1);
        ", &[&loai_mon_id, &name, &sku, &unit, &price, &price2, &cost, &stock, &active]).await.map_err(|e| e.to_string())?;
        
        let row = query.into_row().await.map_err(|e| e.to_string())?;
        if let Some(r) = row {
            target_id = r.get::<i32, _>(0).unwrap_or(0);
        }
    }
    
    if let Some(bytes) = img_bytes {
        if target_id > 0 {
            let query = client.query("SELECT IDMon FROM AnhMon WHERE IDMon = @P1", &[&target_id]).await.map_err(|e| e.to_string())?;
            let row = query.into_row().await.map_err(|e| e.to_string())?;
            if row.is_some() {
                client.execute("UPDATE AnhMon SET AnhMon = @P1 WHERE IDMon = @P2", &[&bytes, &target_id]).await.map_err(|e| e.to_string())?;
            } else {
                client.execute("INSERT INTO AnhMon (IDMon, AnhMon) VALUES (@P1, @P2)", &[&target_id, &bytes]).await.map_err(|e| e.to_string())?;
            }
        }
    }
    
    Ok(format!("{}", target_id))
}

#[tauri::command]
async fn delete_product_db(
    server: String, 
    db_name: String, 
    user: String, 
    pass: String,
    id: i32
) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    client.execute("DELETE FROM AnhMon WHERE IDMon = @P1", &[&id]).await.map_err(|e| e.to_string())?;
    client.execute("DELETE FROM Mon WHERE IDMon = @P1", &[&id]).await.map_err(|e| e.to_string())?;
    
    Ok("Xóa mặt hàng thành công!".to_string())
}

#[tauri::command]
async fn fetch_customers_db(server: String, db_name: String, user: String, pass: String) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    let stream = client.simple_query("
        SELECT 
            k.IDKhachHang, 
            k.MaKhachHang, 
            k.TenKhachHang, 
            k.DiaChiKH, 
            k.DienThoai, 
            k.Email, 
            CAST(ISNULL((
                SELECT TOP 1 CongNoCuoi 
                FROM CongNoKH c 
                WHERE c.IDKhachHang = k.IDKhachHang 
                ORDER BY c.Nam DESC, c.Thang DESC
            ), 0) AS FLOAT) as CongNo
        FROM KhachHang k
    ").await.map_err(|e| e.to_string())?;
    
    let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
    
    let mut customers_json = Vec::new();
    for row in rows {
        let id: i32 = row.get("IDKhachHang").unwrap_or(0);
        let name: &str = row.get("TenKhachHang").unwrap_or("");
        let address: &str = row.get("DiaChiKH").unwrap_or("");
        let phone: &str = row.get("DienThoai").unwrap_or("");
        let debt: f64 = row.get::<f64, _>("CongNo").unwrap_or(0.0);
        
        let c = serde_json::json!({
            "id": id.to_string(),
            "name": name,
            "phone": phone,
            "address": address,
            "debt": debt
        });
        customers_json.push(c);
    }
    
    Ok(serde_json::to_string(&customers_json).unwrap())
}

#[tauri::command]
async fn save_customer_db(
    server: String, 
    db_name: String, 
    user: String, 
    pass: String,
    customer: String,
    month: i32,
    year: i32
) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    let c: serde_json::Value = serde_json::from_str(&customer).map_err(|e| e.to_string())?;
    let id_str = c["id"].as_str().unwrap_or("0");
    let id = id_str.parse::<i32>().unwrap_or(0);
    let name = c["name"].as_str().unwrap_or("");
    let phone = c["phone"].as_str().unwrap_or("");
    let address = c["address"].as_str().unwrap_or("");
    let debt = c["debt"].as_f64().unwrap_or(0.0);
    
    let mut target_id = id;
    
    if target_id > 0 {
        client.execute("
            UPDATE KhachHang 
            SET TenKhachHang = @P1, DienThoai = @P2, DiaChiKH = @P3
            WHERE IDKhachHang = @P4
        ", &[&name, &phone, &address, &target_id]).await.map_err(|e| e.to_string())?;
    } else {
        let mut loai_kh_id = 1;
        let mut found_id = None;

        {
            if let Ok(query_loai) = client.query("SELECT TOP 1 IDLoaiKH FROM LoaiKH ORDER BY IDLoaiKH ASC", &[]).await {
                if let Ok(Some(r)) = query_loai.into_row().await {
                    found_id = r.get("IDLoaiKH");
                }
            }
        }

        if let Some(id) = found_id {
            loai_kh_id = id;
        } else {
            if let Ok(query_loai2) = client.query("SELECT TOP 1 IDLoaiKH FROM LoaiKhachHang ORDER BY IDLoaiKH ASC", &[]).await {
                if let Ok(Some(r2)) = query_loai2.into_row().await {
                    if let Some(id2) = r2.get("IDLoaiKH") {
                        loai_kh_id = id2;
                    }
                }
            }
        }

        let query = client.query("
            INSERT INTO KhachHang (MaKhachHang, TenKhachHang, DiaChiKH, DienThoai, Fax, Email, MaSoThue, SoTaiKhoan, NguoiLienHe, ChucVuNLH, DienThoaiNLH, IDLoaiKH, ThongTinKhac, TenKhongDau, NguoiLienHe2, ChucVuNLH2, DienThoaiNLH2)
            OUTPUT INSERTED.IDKhachHang
            VALUES ('', @P2, @P3, @P4, '', '', '', '', '', '', '', @P1, '', '', '', '', '');
        ", &[&loai_kh_id, &name, &address, &phone]).await.map_err(|e| e.to_string())?;
        
        let row = query.into_row().await.map_err(|e| e.to_string())?;
        if let Some(r) = row {
            target_id = r.get::<i32, _>(0).unwrap_or(0);
        }
    }
    
    if target_id > 0 {
        let query = client.query("
            SELECT IDKhachHang FROM CongNoKH 
            WHERE IDKhachHang = @P1 AND Thang = @P2 AND Nam = @P3
        ", &[&target_id, &month, &year]).await.map_err(|e| e.to_string())?;
        
        let row = query.into_row().await.map_err(|e| e.to_string())?;
        if row.is_some() {
            client.execute("
                UPDATE CongNoKH 
                SET CongNoCuoi = @P1
                WHERE IDKhachHang = @P2 AND Thang = @P3 AND Nam = @P4
            ", &[&debt, &target_id, &month, &year]).await.map_err(|e| e.to_string())?;
        } else {
            client.execute("
                INSERT INTO CongNoKH (IDKhachHang, Thang, Nam, CongNoDau, TraNoDau, PhatSinh, TraPhatSinh, CongNoCuoi)
                VALUES (@P1, @P2, @P3, 0, 0, 0, 0, @P4)
            ", &[&target_id, &month, &year, &debt]).await.map_err(|e| e.to_string())?;
        }
    }
    
    Ok(format!("{}", target_id))
}

#[tauri::command]
async fn delete_customer_db(
    server: String, 
    db_name: String, 
    user: String, 
    pass: String,
    id: i32
) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    client.execute("DELETE FROM CongNoKH WHERE IDKhachHang = @P1", &[&id]).await.map_err(|e| e.to_string())?;
    client.execute("DELETE FROM KhachHang WHERE IDKhachHang = @P1", &[&id]).await.map_err(|e| e.to_string())?;
    
    Ok("Xóa khách hàng thành công!".to_string())
}

#[tauri::command]
async fn save_file_to_downloads(file_name: String, content: String) -> Result<String, String> {
    use std::env;
    use std::fs::File;
    use std::io::Write;
    use std::path::PathBuf;

    let base_dir = env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .map_err(|_| "Could not find home directory".to_string())?;

    let mut path = PathBuf::from(base_dir);
    path.push("Downloads");
    if !path.exists() {
        path = env::current_dir().map_err(|e| e.to_string())?;
    }
    path.push(file_name);

    let mut file = File::create(&path).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(DbState { connected: false }))
        .invoke_handler(tauri::generate_handler![
            load_app_data, 
            save_app_data,
            connect_db,
            check_db_status,
            get_config_path,
            load_settings,
            save_settings,
            open_config_folder,
            test_mssql_connection,
            fetch_products_db,
            save_product_db,
            delete_product_db,
            fetch_customers_db,
            save_customer_db,
            delete_customer_db,
            save_file_to_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
