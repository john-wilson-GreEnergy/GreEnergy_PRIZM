use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};
use sysinfo::{Pid, System};
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

const SERVICE_NAME: &str = "GreEnergy PRIZM";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    port: u16,
    browser_launch: bool,
    automatic_startup: bool,
    log_retention: u16,
    startup_timeout_seconds: u16,
    workspace_url: String,
    update_channel: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            port: 3000,
            browser_launch: true,
            automatic_startup: true,
            log_retention: 20,
            startup_timeout_seconds: 120,
            workspace_url: "http://localhost:3000".into(),
            update_channel: "manual".into(),
        }
    }
}

fn data_root() -> PathBuf {
    PathBuf::from(env::var("PROGRAMDATA").unwrap_or_else(|_| r"C:\ProgramData".into()))
        .join("GreEnergy")
        .join("PRIZM")
}
fn install_root() -> PathBuf {
    env::current_exe()
        .ok()
        .and_then(|p| p.parent()?.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files\GreEnergy\PRIZM"))
}
fn settings_path() -> PathBuf {
    data_root().join("Config").join("settings.json")
}
fn read_settings_inner() -> Result<Settings, String> {
    let path = settings_path();
    if !path.exists() {
        return Ok(Settings::default());
    }
    serde_json::from_str(&fs::read_to_string(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
fn sc(args: &[&str]) -> Result<String, String> {
    let output = Command::new("sc.exe")
        .args(args)
        .output()
        .map_err(|e| format!("Unable to execute Service Control Manager: {e}"))?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if output.status.success() {
        Ok(combined)
    } else {
        Err(combined.trim().to_string())
    }
}
fn service_query() -> Result<(String, Option<u32>), String> {
    let text = sc(&["queryex", SERVICE_NAME])?;
    let status = if text.contains("RUNNING") {
        "Running"
    } else if text.contains("START_PENDING") {
        "Starting"
    } else if text.contains("STOP_PENDING") {
        "Stopping"
    } else if text.contains("STOPPED") {
        "Stopped"
    } else {
        "Error"
    };
    let pid = text.lines().find_map(|line| {
        if line.contains("PID") {
            line.split(':').nth(1)?.trim().parse::<u32>().ok()
        } else {
            None
        }
    });
    Ok((status.into(), pid.filter(|p| *p > 0)))
}

#[tauri::command]
fn get_status() -> Result<Value, String> {
    let (status, pid) = service_query()?;
    let mut cpu = 0.0_f32;
    let mut memory = 0_u64;
    let mut uptime = 0_u64;
    if let Some(raw_pid) = pid {
        let system = System::new_all();
        if let Some(process) = system.process(Pid::from_u32(raw_pid)) {
            cpu = process.cpu_usage();
            memory = process.memory();
            uptime = process.run_time();
        }
    }
    let build_path = install_root().join("app").join("build-info.json");
    let build: Value = fs::read_to_string(build_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({"version":"unknown","build":"unknown","branch":"unknown","commit":"unknown"}));
    Ok(json!({
        "status": status, "pid": pid, "cpu": cpu, "memory": memory,
        "uptime": uptime, "buildInfo": build
    }))
}

fn get_json(client: &reqwest::blocking::Client, base: &str, route: &str) -> Value {
    match client.get(format!("{}{}", base.trim_end_matches('/'), route)).send() {
        Ok(response) => {
            let code = response.status().as_u16();
            match response.json::<Value>() {
                Ok(body) => json!({"ok": (200..300).contains(&code), "status": code, "body": body}),
                Err(error) => json!({"ok": false, "status": code, "error": error.to_string()})
            }
        }
        Err(error) => json!({"ok": false, "status": 0, "error": error.to_string()}),
    }
}

#[tauri::command]
fn get_health() -> Result<Value, String> {
    let settings = read_settings_inner()?;
    let base = format!("http://localhost:{}", settings.port);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "coordinator": get_json(&client, &base, "/api/local/debug/coordinator"),
        "coordinatorProfile": get_json(&client, &base, "/api/local/debug/coordinator/profile"),
        "publication": get_json(&client, &base, "/api/local/debug/canonical-publication"),
        "workspace": get_json(&client, &base, "/api/local/debug/workspace-projections"),
        "projection": get_json(&client, &base, "/api/local/workspaces/operator"),
        "telemetry": get_json(&client, &base, "/api/local/debug/telemetry"),
        "stringViewer": get_json(&client, &base, "/api/local/debug/stringviewer"),
        "feather": get_json(&client, &base, "/api/local/debug/feather"),
        "ems": get_json(&client, &base, "/api/local/site-health")
    }))
}

#[tauri::command]
fn control_service(action: String) -> Result<String, String> {
    match action.as_str() {
        "start" => sc(&["start", SERVICE_NAME]),
        "stop" => sc(&["stop", SERVICE_NAME]),
        "restart" => {
            let _ = sc(&["stop", SERVICE_NAME]);
            for _ in 0..60 {
                if service_query().map(|v| v.0 == "Stopped").unwrap_or(false) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(500));
            }
            sc(&["start", SERVICE_NAME])
        }
        _ => Err("Unsupported service action.".into()),
    }
}

#[tauri::command]
fn load_settings() -> Result<Settings, String> {
    read_settings_inner()
}

#[tauri::command]
fn save_settings(settings: Settings) -> Result<(), String> {
    if settings.port == 0
        || settings.log_retention == 0
        || settings.log_retention > 1000
        || settings.startup_timeout_seconds < 10
        || !settings.workspace_url.starts_with("http://localhost")
        || settings.update_channel != "manual"
    {
        return Err("Settings failed validation.".into());
    }
    let path = settings_path();
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temporary, path).map_err(|e| e.to_string())
}

fn log_files() -> Result<Vec<PathBuf>, String> {
    let dir = data_root().join("Logs");
    let mut files: Vec<_> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();
    files.sort_by_key(|p| fs::metadata(p).and_then(|m| m.modified()).ok());
    files.reverse();
    Ok(files)
}

#[tauri::command]
fn list_logs() -> Result<Vec<String>, String> {
    Ok(log_files()?
        .into_iter()
        .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
        .collect())
}

#[tauri::command]
fn read_log(name: String) -> Result<String, String> {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("Invalid log name.".into());
    }
    let path = data_root().join("Logs").join(name);
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let length = file.metadata().map_err(|e| e.to_string())?.len();
    if length > 2_000_000 {
        use std::io::{Seek, SeekFrom};
        file.seek(SeekFrom::End(-2_000_000)).map_err(|e| e.to_string())?;
    }
    let mut text = String::new();
    file.read_to_string(&mut text).map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
fn export_log(name: String) -> Result<String, String> {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("Invalid log name.".into());
    }
    let source = data_root().join("Logs").join(&name);
    let destination = dirs::desktop_dir()
        .ok_or("Desktop folder is unavailable.")?
        .join(name);
    fs::copy(source, &destination).map_err(|e| e.to_string())?;
    Ok(destination.to_string_lossy().into_owned())
}

fn add_directory(zip: &mut ZipWriter<File>, root: &Path, directory: &Path) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_dir() {
            add_directory(zip, root, &path)?;
        } else {
            let name = path.strip_prefix(root).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
            zip.start_file(name, SimpleFileOptions::default()).map_err(|e| e.to_string())?;
            zip.write_all(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn create_backup() -> Result<String, String> {
    let root = data_root();
    let backups = root.join("Backups");
    fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    let path = backups.join(format!("PRIZM-{}.zip", Utc::now().format("%Y%m%d-%H%M%S")));
    let file = File::create(&path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    for name in ["Config", "Cache", "Telemetry"] {
        add_directory(&mut zip, &root, &root.join(name))?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn restore_latest_backup() -> Result<String, String> {
    if service_query()?.0 != "Stopped" {
        return Err("Stop PRIZM before restoring a backup.".into());
    }
    let backups = data_root().join("Backups");
    let mut files: Vec<_> = fs::read_dir(&backups)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|v| v.eq_ignore_ascii_case("zip")))
        .collect();
    files.sort_by_key(|p| fs::metadata(p).and_then(|m| m.modified()).ok());
    let latest = files.pop().ok_or("No backup is available.")?;
    let mut zip = ZipArchive::new(File::open(&latest).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    for index in 0..zip.len() {
        let mut item = zip.by_index(index).map_err(|e| e.to_string())?;
        let relative = item.enclosed_name().ok_or("Unsafe backup entry.")?.to_path_buf();
        let destination = data_root().join(relative);
        if item.is_dir() {
            fs::create_dir_all(destination).map_err(|e| e.to_string())?;
        } else {
            fs::create_dir_all(destination.parent().unwrap()).map_err(|e| e.to_string())?;
            std::io::copy(&mut item, &mut File::create(destination).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(latest.to_string_lossy().into_owned())
}

#[tauri::command]
fn install_staged_update() -> Result<String, String> {
    let msi = data_root().join("Updates").join("GreEnergy_PRIZM_Setup.msi");
    if !msi.is_file() {
        return Err(format!("Place the approved MSI at {}.", msi.display()));
    }
    let msi_argument = msi.to_string_lossy().into_owned();
    let status = Command::new("msiexec.exe")
        .args(["/i", msi_argument.as_str(), "/passive", "/norestart"])
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() { Ok("Update installer completed.".into()) } else { Err(format!("Installer exited with {status}.")) }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_status, get_health, control_service, load_settings, save_settings,
            list_logs, read_log, export_log, create_backup, restore_latest_backup, install_staged_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running GreEnergy PRIZM Manager");
}
