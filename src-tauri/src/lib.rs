mod installer;
use installer::InstallError;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, State};
#[derive(Default)]
struct InstallState(AtomicBool);
struct InstallGuard<'a>(&'a AtomicBool);
impl Drop for InstallGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
#[tauri::command]
async fn install_modpack(
    app: AppHandle,
    state: State<'_, InstallState>,
    project_id: String,
    version_id: String,
    name: String,
) -> Result<String, InstallError> {
    if state.0.swap(true, Ordering::AcqRel) {
        return Err(InstallError::new(
            "prepare_instance",
            "Another installation is already running",
        ));
    }
    let _guard = InstallGuard(&state.0);
    let data_dir = dirs::data_local_dir().ok_or_else(|| {
        InstallError::new("prepare_instance", "No local application data directory")
    })?;
    installer::install(&project_id, &version_id, &name, &data_dir, |p| {
        let _ = app.emit("install-progress", p);
    })
    .await
    .map(|p| p.to_string_lossy().into())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(InstallState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![install_modpack])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
