mod installer;
pub mod backend;
use backend::commands::*;
use std::sync::Arc;
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
        .manage(Arc::new(backend::Backend::new().expect("Cannot initialize Canary data storage")))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window,event| {
            if let tauri::WindowEvent::CloseRequested{api,..}=event {
                use tauri::Manager;
                let backend=window.state::<Arc<backend::Backend>>();
                if !backend.processes.lock().unwrap().is_empty(){
                    // Keep the process monitor alive; never silently kill an active world.
                    api.prevent_close();let _=window.emit("backend-error",backend::model::BackendError::new("game_running","Stop Minecraft before closing Canary"));
                }
            }
        })
        .invoke_handler(tauri::generate_handler![install_modpack,backend_snapshot,save_backend_settings,detect_java,test_java,create_local_account,switch_account,remove_account,rename_local_account,authenticate_provider,minecraft_versions,loader_versions,prepare_instance,create_instance,launch_instance,stop_instance,cancel_operation,update_instance,delete_instance,open_instance_folder,game_logs,scan_screenshots,open_screenshot,curseforge_search,curseforge_project,curseforge_files,install_curseforge_pack,check_modpack_updates,authenticate_elyby,restore_accounts,content_inventory,content_worlds,content_search,content_project,content_versions,content_preview,install_content,content_action,content_rollback,content_updates,choose_content_files,inspect_content_files,import_content_files,bulk_install_content,pack_update_preview,apply_pack_update])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
