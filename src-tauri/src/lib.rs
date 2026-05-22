use std::fs;
use tauri::State;
use tokio::sync::Mutex;
// Thư viện tiberius sẽ được import chính thức ở bước cấu hình cụ thể
// use tiberius::{Client, Config};
// use tokio::net::TcpStream;
// use tokio_util::compat::TokioAsyncWriteCompatExt;

struct DbState {
    pub connected: bool,
    // client: Option<Client<tokio_util::compat::Compat<TcpStream>>>
}

#[tauri::command]
async fn connect_db(state: State<'_, Mutex<DbState>>, ip: &str, _pass: &str) -> Result<String, String> {
    // Đoạn code giả lập kết nối, sẽ được thay bằng config tiberius
    // let mut config = Config::new();
    // config.host(ip);
    // config.authentication(AuthMethod::sql_server("sa", pass));
    
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(DbState { connected: false }))
        .invoke_handler(tauri::generate_handler![
            load_app_data, 
            save_app_data,
            connect_db,
            check_db_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
