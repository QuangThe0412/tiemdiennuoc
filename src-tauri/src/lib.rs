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
            a.AnhMon,
            a.URL
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
        
        let image_url: Option<&str> = row.get("URL");
        let image_base64 = if let Some(url) = image_url {
            if !url.is_empty() {
                url.to_string()
            } else {
                let image_bytes: Option<&[u8]> = row.get("AnhMon");
                image_bytes.map(|b| format!("data:image/jpeg;base64,{}", to_base64(b))).unwrap_or_default()
            }
        } else {
            let image_bytes: Option<&[u8]> = row.get("AnhMon");
            image_bytes.map(|b| format!("data:image/jpeg;base64,{}", to_base64(b))).unwrap_or_default()
        };
        
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
    let is_url = img_base64.starts_with("http://") || img_base64.starts_with("https://");
    let is_base64 = img_base64.starts_with("data:image/");
    
    let img_bytes = if is_base64 {
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
    
    if target_id > 0 {
        if is_url || is_base64 {
            let query = client.query("SELECT IDMon FROM AnhMon WHERE IDMon = @P1", &[&target_id]).await.map_err(|e| e.to_string())?;
            let row = query.into_row().await.map_err(|e| e.to_string())?;
            
            let bytes_val: Option<&[u8]> = if is_base64 { img_bytes.as_deref() } else { None };
            let url_val: Option<&str> = if is_url { Some(img_base64) } else { None };
            
            if row.is_some() {
                client.execute("UPDATE AnhMon SET AnhMon = @P1, URL = @P2 WHERE IDMon = @P3", &[&bytes_val, &url_val, &target_id]).await.map_err(|e| e.to_string())?;
            } else {
                client.execute("INSERT INTO AnhMon (IDMon, AnhMon, URL) VALUES (@P1, @P2, @P3)", &[&target_id, &bytes_val, &url_val]).await.map_err(|e| e.to_string())?;
            }
        } else if img_base64.is_empty() {
            client.execute("DELETE FROM AnhMon WHERE IDMon = @P1", &[&target_id]).await.map_err(|e| e.to_string())?;
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
            CAST(k.IDKhachHang AS VARCHAR(50)) as IDKhachHang, 
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
        let id: &str = row.get("IDKhachHang").unwrap_or("0");
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
    id: String
) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    client.execute("DELETE FROM CongNoKH WHERE CAST(IDKhachHang AS VARCHAR(50)) = @P1", &[&id]).await.map_err(|e| e.to_string())?;
    client.execute("DELETE FROM KhachHang WHERE CAST(IDKhachHang AS VARCHAR(50)) = @P1", &[&id]).await.map_err(|e| e.to_string())?;
    
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

#[tauri::command]
async fn fetch_invoices_db(
    server: String,
    db_name: String,
    user: String,
    pass: String,
    from_date: String,
    to_date: String,
    customer_query: String,
    invoice_code_query: String
) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    let from_dt = format!("{} 00:00:00", from_date);
    let to_dt = format!("{} 23:59:59", to_date);
    
    let cust_like = if customer_query.is_empty() {
        "".to_string()
    } else {
        format!("%{}%", customer_query)
    };
    
    let code_like = if invoice_code_query.is_empty() {
        "".to_string()
    } else {
        format!("%{}%", invoice_code_query)
    };
    
    let query_str = "
        SELECT 
            h.IDHoaDon,
            h.MaHoaDon,
            CONVERT(varchar, h.NgayHD, 23) as NgayHDStr,
            CONVERT(varchar, h.GioHD, 108) as GioHDStr,
            CAST(h.PTKhuyenMai AS FLOAT) as PTKhuyenMai,
            CAST(h.TienKhuyenMai AS FLOAT) as TienKhuyenMai,
            h.GhiChu,
            CAST(h.IDKhachHang AS VARCHAR(50)) as IDKhachHang,
            k.TenKhachHang,
            k.DienThoai as DienThoaiKH,
            CAST(ISNULL((
                SELECT SUM(ct.SoLuong * ct.DonGia * (1.0 - ISNULL(ct.PTKhuyenMaiMon, 0.0) / 100.0))
                FROM ChiTietHD ct
                WHERE ct.IDHoaDon = h.IDHoaDon
            ), 0.0) AS FLOAT) as TongTien
        FROM HoaDon h
        LEFT JOIN KhachHang k ON h.IDKhachHang = k.IDKhachHang
        WHERE h.NgayHD >= @P1 AND h.NgayHD <= @P2
          AND (@P3 = '' OR k.TenKhachHang LIKE @P3 OR k.DienThoai LIKE @P3)
          AND (@P4 = '' OR h.MaHoaDon LIKE @P4)
        ORDER BY h.NgayHD DESC, h.GioHD DESC
    ";
    
    let stream = client.query(query_str, &[&from_dt, &to_dt, &cust_like, &code_like]).await.map_err(|e| e.to_string())?;
    let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
    
    let mut invoices = Vec::new();
    for row in rows {
        let id: i32 = row.get("IDHoaDon").unwrap_or(0);
        let code: &str = row.get("MaHoaDon").unwrap_or("");
        let ngay_hd: &str = row.get("NgayHDStr").unwrap_or("");
        let gio_hd: &str = row.get("GioHDStr").unwrap_or("");
        let pt_km: f64 = row.get("PTKhuyenMai").unwrap_or(0.0);
        let tien_km: f64 = row.get("TienKhuyenMai").unwrap_or(0.0);
        let note: &str = row.get("GhiChu").unwrap_or("");
        let customer_id: &str = row.get("IDKhachHang").unwrap_or("0");
        let customer_name: &str = row.get("TenKhachHang").unwrap_or("Khách lẻ");
        let customer_phone: &str = row.get("DienThoaiKH").unwrap_or("");
        let total: f64 = row.get("TongTien").unwrap_or(0.0);
        
        invoices.push(serde_json::json!({
            "IDHoaDon": id,
            "MaHoaDon": code,
            "NgayHDStr": ngay_hd,
            "GioHDStr": gio_hd,
            "PTKhuyenMai": pt_km,
            "TienKhuyenMai": tien_km,
            "GhiChu": note,
            "IDKhachHang": customer_id.to_string(),
            "TenKhachHang": customer_name,
            "DienThoaiKH": customer_phone,
            "TongTien": total
        }));
    }
    
    Ok(serde_json::to_string(&invoices).unwrap())
}

#[tauri::command]
async fn fetch_invoice_details_db(
    server: String,
    db_name: String,
    user: String,
    pass: String,
    invoice_id: i32
) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    let query_str = "
        SELECT 
            ct.IDChiTietHD,
            ct.IDMon,
            m.TenMon,
            m.DVTMon,
            CAST(ct.SoLuong AS FLOAT) as SoLuong,
            CAST(ct.DonGia AS FLOAT) as DonGia,
            CAST(ct.PTKhuyenMaiMon AS FLOAT) as PTKhuyenMaiMon,
            CAST((ct.SoLuong * ct.DonGia * (1.0 - ISNULL(ct.PTKhuyenMaiMon, 0.0) / 100.0)) AS FLOAT) as ThanhTien
        FROM ChiTietHD ct
        INNER JOIN Mon m ON ct.IDMon = m.IDMon
        WHERE ct.IDHoaDon = @P1
    ";
    
    let stream = client.query(query_str, &[&invoice_id]).await.map_err(|e| e.to_string())?;
    let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
    
    let mut items = Vec::new();
    for row in rows {
        let id: i32 = row.get("IDChiTietHD").unwrap_or(0);
        let product_id: i32 = row.get("IDMon").unwrap_or(0);
        let product_name: &str = row.get("TenMon").unwrap_or("");
        let unit: &str = row.get("DVTMon").unwrap_or("");
        let quantity: f64 = row.get("SoLuong").unwrap_or(0.0);
        let price: f64 = row.get("DonGia").unwrap_or(0.0);
        let discount: f64 = row.get("PTKhuyenMaiMon").unwrap_or(0.0);
        let total: f64 = row.get("ThanhTien").unwrap_or(0.0);
        
        items.push(serde_json::json!({
            "id": id,
            "productId": product_id,
            "productName": product_name,
            "unit": unit,
            "quantity": quantity,
            "price": price,
            "discount": discount,
            "total": total
        }));
    }
    
    Ok(serde_json::to_string(&items).unwrap())
}

#[tauri::command]
async fn save_invoice_db(
    server: String,
    db_name: String,
    user: String,
    pass: String,
    invoice_no: String,
    customer_id: String,
    discount_pct: f64,
    discount_val: f64,
    notes: String,
    items: Vec<serde_json::Value>
) -> Result<i32, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    let mut doi_tac_id: i32 = 0;
    if let Ok(query_dt) = client.query("SELECT TOP 1 IDDoiTac FROM DoiTac ORDER BY IDDoiTac ASC", &[]).await {
        if let Ok(Some(row_dt)) = query_dt.into_row().await {
            if let Some(dt_id) = row_dt.get("IDDoiTac") {
                doi_tac_id = dt_id;
            }
        }
    }

    let mut nguoi_dung_id: i32 = 1;
    if let Ok(query_nd) = client.query("SELECT TOP 1 IDNguoiDung FROM NguoiDung ORDER BY IDNguoiDung ASC", &[]).await {
        if let Ok(Some(row_nd)) = query_nd.into_row().await {
            if let Some(nd_id) = row_nd.get("IDNguoiDung") {
                nguoi_dung_id = nd_id;
            }
        }
    }

    // Validate customer_id exists in KhachHang; if not, fall back to first available
    let mut resolved_customer_id = customer_id.clone();
    let mut kh_count: i32 = 0;
    {
        if let Ok(stream) = client.query(
            "SELECT COUNT(1) as cnt FROM KhachHang WHERE CAST(IDKhachHang AS VARCHAR(50)) = @P1",
            &[&customer_id]
        ).await {
            if let Ok(Some(row)) = stream.into_row().await {
                kh_count = row.get(0).unwrap_or(0);
            }
        }
    }
    if kh_count == 0 {
        if let Ok(fallback_stream) = client.query(
            "SELECT TOP 1 CAST(IDKhachHang AS VARCHAR(50)) AS IDKhachHang FROM KhachHang ORDER BY IDKhachHang ASC",
            &[]
        ).await {
            if let Ok(Some(fallback_row)) = fallback_stream.into_row().await {
                if let Some(fid) = fallback_row.get::<&str, _>("IDKhachHang") {
                    resolved_customer_id = fid.to_string();
                }
            }
        }
    }

    // Insert into HoaDon table
    let insert_hd_query = "
        INSERT INTO HoaDon (
            NgayHD, GioHD, PTKhuyenMai, TienKhuyenMai, IDNguoiDung, LanIn, Ca, VAT, GhiChu, IDKhachHang, IDDoiTac, IDPhieuChiDoiTac, MaHoaDon, DiemQuyDoi, Locked
        )
        OUTPUT INSERTED.IDHoaDon
        VALUES (
            GETDATE(), GETDATE(), CAST(@P1 AS decimal(18,2)), CAST(@P2 AS decimal(18,2)), @P3, 0, 1, 0, @P4, @P5, @P6, 0, @P7, 0, 0
        )
    ";
    
    let stream = client.query(
        insert_hd_query,
        &[
            &discount_pct,
            &discount_val,
            &nguoi_dung_id,
            &notes,
            &resolved_customer_id,
            &doi_tac_id,
            &invoice_no
        ]
    ).await.map_err(|e| e.to_string())?;
    
    let row = stream.into_row().await.map_err(|e| e.to_string())?
        .ok_or_else(|| "Failed to insert HoaDon: ID output not returned".to_string())?;
        
    let invoice_id: i32 = row.get(0).unwrap_or(0);
    
    // Insert items into ChiTietHD
    for item in items {
        // Parse IDMon: productId is sent as a JSON number from frontend, so read as_i64() directly
        let product_id: i32 = item["productId"].as_i64().unwrap_or(0) as i32;
        
        let quantity: f64 = item["quantity"].as_f64().unwrap_or(
            item["quantity"].as_i64().unwrap_or(0) as f64
        );
        let price: f64 = item["price"].as_f64().unwrap_or(
            item["price"].as_i64().unwrap_or(0) as f64
        );
        let discount: f64 = item["discount"].as_f64().unwrap_or(
            item["discount"].as_i64().unwrap_or(0) as f64
        );
        
        client.execute(
            "INSERT INTO ChiTietHD (IDHoaDon, IDMon, SoLuong, DonGia, PTKhuyenMaiMon, VAT)
             VALUES (@P1, @P2, CAST(@P3 AS decimal(18,2)), CAST(@P4 AS decimal(18,2)), CAST(@P5 AS decimal(18,2)), 0)",
            &[&invoice_id, &product_id, &quantity, &price, &discount]
        ).await.map_err(|e| e.to_string())?;
    }
    
    Ok(invoice_id)
}

#[tauri::command]
async fn get_database_schema(
    server: String, 
    db_name: String, 
    user: String, 
    pass: String
) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;
    
    let stream = client.simple_query("
        SELECT 
            t.name AS TableName,
            c.name AS ColumnName,
            ty.name AS DataType
        FROM sys.tables t
        INNER JOIN sys.columns c ON t.object_id = c.object_id
        INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
        ORDER BY t.name, c.column_id
    ").await.map_err(|e| e.to_string())?;
    
    let rows = stream.into_first_result().await.map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for row in rows {
        let table_name: &str = row.get("TableName").unwrap_or("");
        let column_name: &str = row.get("ColumnName").unwrap_or("");
        let data_type: &str = row.get("DataType").unwrap_or("");
        list.push(serde_json::json!({
            "table": table_name,
            "column": column_name,
            "type": data_type
        }));
    }
    
    Ok(serde_json::to_string(&list).unwrap())
}

#[tauri::command]
async fn backup_database(
    app: tauri::AppHandle,
    server: String,
    db_name: String,
    user: String,
    pass: String,
) -> Result<String, String> {
    use tauri::Manager;
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }

    let config = get_mssql_config(&server, &db_name, &user, &pass);
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;

    // Query default backup directory of the SQL Server instance
    let query_path = client.simple_query("SELECT CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS NVARCHAR(4000)) AS BackupDir").await.map_err(|e| e.to_string())?;
    let rows_path = query_path.into_first_result().await.map_err(|e| e.to_string())?;
    let mut backup_dir = String::from("C:\\Windows\\Temp");
    if let Some(row) = rows_path.first() {
        let path: &str = row.get("BackupDir").unwrap_or("");
        if !path.is_empty() {
            backup_dir = path.to_string();
        }
    }

    let date_str = chrono::Local::now().format("%Y%m%d").to_string();
    let backup_filename = format!("{}_{}.bak", date_str, db_name);
    let dest_path = app_dir.join(&backup_filename);
    let temp_backup_path = format!("{}\\{}_temp.bak", backup_dir.trim_end_matches('\\'), db_name);

    let clean_db_name = db_name.replace("'", "''").replace("[", "").replace("]", "");
    let sql = format!(
        "BACKUP DATABASE [{}] TO DISK = '{}' WITH FORMAT, INIT",
        clean_db_name, temp_backup_path
    );

    // Run backup database command and consume the stream to wait for execution to complete
    let stream = client.simple_query(sql).await.map_err(|e| format!("Lỗi khởi chạy SQL Backup: {}", e))?;
    let _ = stream.into_first_result().await.map_err(|e| format!("Lỗi thực thi SQL Backup: {}", e))?;

    let temp_file_path = std::path::Path::new(&temp_backup_path);
    if temp_file_path.exists() {
        fs::copy(temp_file_path, &dest_path).map_err(|e| format!("Lỗi sao chép file backup từ '{}' sang '{}': {}", temp_backup_path, dest_path.to_string_lossy(), e))?;
        let _ = fs::remove_file(temp_file_path);
        Ok(format!("Đã sao lưu thành công tại: {}", dest_path.to_string_lossy()))
    } else {
        Ok(format!(
            "Đã chạy lệnh sao lưu trên SQL Server từ xa. File backup được lưu trên máy chủ tại: {}",
            temp_backup_path
        ))
    }
}

#[tauri::command]
async fn fix_init_db(
    server: String,
    db_name: String,
    user: String,
    pass: String,
) -> Result<String, String> {
    let config = get_mssql_config(&server, &db_name, &user, &pass);
    let tcp = TcpStream::connect(config.get_addr()).await.map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut client = Client::connect(config, tcp.compat_write()).await.map_err(|e| e.to_string())?;

    // Check table AnhMon exists
    let query_table = client.query("SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AnhMon'", &[]).await.map_err(|e| e.to_string())?;
    let row_table = query_table.into_row().await.map_err(|e| e.to_string())?;
    if row_table.is_none() {
        client.execute("
            CREATE TABLE AnhMon (
                IDMon INT PRIMARY KEY FOREIGN KEY REFERENCES Mon(IDMon) ON DELETE CASCADE,
                AnhMon VARBINARY(MAX) NULL,
                URL NVARCHAR(MAX) NULL
            )
        ", &[]).await.map_err(|e| format!("Lỗi tạo bảng AnhMon: {}", e))?;
        return Ok("Bảng AnhMon chưa tồn tại, đã khởi tạo bảng mới chứa cột URL thành công!".to_string());
    }

    // Check column URL exists
    let query_col = client.query(
        "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AnhMon' AND COLUMN_NAME = 'URL'",
        &[]
    ).await.map_err(|e| e.to_string())?;
    
    let row_col = query_col.into_row().await.map_err(|e| e.to_string())?;
    if row_col.is_none() {
        client.execute("ALTER TABLE AnhMon ADD URL NVARCHAR(MAX) NULL", &[]).await.map_err(|e| format!("Lỗi thêm cột URL: {}", e))?;
        Ok("Đã thêm thành công cột URL vào bảng AnhMon!".to_string())
    } else {
        Ok("Cột URL đã tồn tại trong bảng AnhMon, không cần thay đổi gì.".to_string())
    }
}

#[tauri::command]
async fn delete_drive_image_rust(delete_url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::default())
        .build()
        .map_err(|e| e.to_string())?;
        
    let res = client.get(&delete_url)
        .send()
        .await
        .map_err(|e| format!("Lỗi kết nối tới Apps Script: {}", e))?;
        
    let body = res.text().await.map_err(|e| format!("Lỗi đọc dữ liệu Apps Script: {}", e))?;
    Ok(body)
}

fn get_local_ip() -> Option<String> {
    use std::net::UdpSocket;
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return Some(addr.ip().to_string());
            }
        }
    }
    None
}

fn get_local_ips_fallback() -> Vec<String> {
    let mut ips = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("ipconfig").output() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                // Match both English and Vietnamese ipconfig output
                // e.g. "   IPv4 Address. . . . . : 192.168.1.100"
                // or   "   Địa chỉ IPv4 . . . . . : 192.168.1.100"
                let is_ipv4_line = line.contains("IPv4 Address") 
                    || line.contains("Địa chỉ IPv4")
                    || line.contains("IPv4-Adresse")  // German
                    || (line.contains("IPv4") && line.contains('.'));
                if is_ipv4_line {
                    if let Some(colon_pos) = line.rfind(':') {
                        let raw = &line[colon_pos + 1..];
                        // Trim whitespace and common suffix like "(Preferred)"
                        let ip = raw
                            .split('(')  // remove "(Preferred)" suffix
                            .next()
                            .unwrap_or("")
                            .trim()
                            .to_string();
                        // Validate it looks like an IP (x.x.x.x)
                        let parts: Vec<&str> = ip.split('.').collect();
                        if parts.len() == 4 && parts.iter().all(|p| p.parse::<u8>().is_ok()) {
                            ips.push(ip);
                        }
                    }
                }
            }
        }
    }
    ips
}

fn get_subnet_prefixes() -> Vec<String> {
    let mut subnets = Vec::new();
    if let Some(ip) = get_local_ip() {
        let parts: Vec<&str> = ip.split('.').collect();
        if parts.len() == 4 {
            subnets.push(format!("{}.{}.{}", parts[0], parts[1], parts[2]));
        }
    }
    for ip in get_local_ips_fallback() {
        let parts: Vec<&str> = ip.split('.').collect();
        if parts.len() == 4 {
            let subnet = format!("{}.{}.{}", parts[0], parts[1], parts[2]);
            if !subnets.contains(&subnet) {
                subnets.push(subnet);
            }
        }
    }
    if subnets.is_empty() {
        subnets.push("192.168.1".to_string());
        subnets.push("192.168.0".to_string());
    }
    subnets
}

#[tauri::command]
async fn scan_network_printers() -> Result<Vec<String>, String> {
    use std::net::SocketAddr;
    use tokio::net::TcpStream;
    use tokio::time::timeout;
    use std::time::Duration;

    // Common thermal printer ports: 9100 (standard RAW/JetDirect), 
    // 515 (LPD), 6101 (some Epson/cheap models), 8080 (some variants)
    let ports_to_scan: Vec<u16> = vec![9100, 515, 6101, 8080];
    let subnets = get_subnet_prefixes();
    let mut tasks = vec![];

    for subnet in subnets {
        for i in 1..=254 {
            for &port in &ports_to_scan {
                let ip = format!("{}.{}", subnet, i);
                let addr_str = format!("{}:{}", ip, port);
                let addr: SocketAddr = match addr_str.parse() {
                    Ok(a) => a,
                    Err(_) => continue,
                };
                let result_label = format!("{}:{}", ip, port);

                tasks.push(tokio::spawn(async move {
                    // 1500ms timeout – more tolerant of WiFi/slow network printers
                    match timeout(Duration::from_millis(1500), TcpStream::connect(&addr)).await {
                        Ok(Ok(_stream)) => Some(result_label),
                        _ => None,
                    }
                }));
            }
        }
    }

    let mut printers = vec![];
    for task in tasks {
        if let Ok(Some(label)) = task.await {
            if !printers.contains(&label) {
                printers.push(label);
            }
        }
    }

    Ok(printers)
}

#[tauri::command]
async fn print_bill_network(ip: String, payload: String) -> Result<String, String> {
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpStream;
    use tokio::time::timeout;
    use std::time::Duration;

    // Accept either "192.168.1.100" or "192.168.1.100:9100"
    let addr_str = if ip.contains(':') {
        ip.clone()
    } else {
        format!("{}:9100", ip)
    };

    let mut stream = match timeout(Duration::from_secs(5), TcpStream::connect(&addr_str)).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => return Err(format!("Không thể kết nối tới máy in tại {}: {}", addr_str, e)),
        Err(_) => return Err(format!("Thời gian kết nối tới máy in tại {} quá hạn (Timeout)!", addr_str)),
    };

    let mut data = Vec::new();
    // ESC @ – Initialize printer (reset settings)
    data.extend_from_slice(b"\x1b@");
    // ESC t 0 – Select character code table: PC437 (pure ASCII/Latin)
    // This ensures the printer uses an ASCII-compatible codepage
    data.extend_from_slice(b"\x1bt\x00");

    // Safety net: convert each Unicode char → ASCII byte.
    // The frontend should already have transliterated Vietnamese to ASCII,
    // but this ensures absolutely no multi-byte UTF-8 leaks through.
    let safe_payload: Vec<u8> = payload
        .chars()
        .map(|c| {
            if c.is_ascii() {
                c as u8
            } else {
                b'?' // Fallback for any remaining non-ASCII character
            }
        })
        .collect();
    data.extend_from_slice(&safe_payload);
    // Feed 4 lines + full paper cut (GS V B 0)
    data.extend_from_slice(b"\n\n\n\n\x1bd\x04\x1dVB\x00");

    match stream.write_all(&data).await {
        Ok(_) => Ok(format!("Đã gửi lệnh in thành công tới {}!", addr_str)),
        Err(e) => Err(format!("Lỗi gửi dữ liệu tới máy in: {}", e)),
    }
}

#[tauri::command]
async fn print_raw_network(ip: String, payload: Vec<u8>) -> Result<String, String> {
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpStream;
    use tokio::time::timeout;
    use std::time::Duration;

    let addr_str = if ip.contains(':') {
        ip.clone()
    } else {
        format!("{}:9100", ip)
    };

    let mut stream = match timeout(Duration::from_secs(5), TcpStream::connect(&addr_str)).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => return Err(format!("Không thể kết nối tới máy in tại {}: {}", addr_str, e)),
        Err(_) => return Err(format!("Thời gian kết nối tới máy in tại {} quá hạn (Timeout)!", addr_str)),
    };

    match stream.write_all(&payload).await {
        Ok(_) => Ok(format!("Đã gửi lệnh in raw thành công tới {}!", addr_str)),
        Err(e) => Err(format!("Lỗi gửi dữ liệu tới máy in: {}", e)),
    }
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
            save_file_to_downloads,
            get_database_schema,
            fetch_invoices_db,
            fetch_invoice_details_db,
            save_invoice_db,
            backup_database,
            fix_init_db,
            delete_drive_image_rust,
            scan_network_printers,
            print_bill_network,
            print_raw_network
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
