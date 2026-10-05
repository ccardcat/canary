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
    backend:State<'_,Arc<backend::Backend>>,
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
    let _lease=backend.inner().lease(&format!("{project_id}-{version_id}")).map_err(|e|InstallError::new("prepare_instance",e.message))?;
    let instances=backend.instances_root();
    installer::install_at(&project_id, &version_id, &name, &instances, |p| {
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
        .setup(|app|{use tauri::Manager;let backend=app.state::<Arc<backend::Backend>>();if let Ok(instances)=backend.instances(){for instance in instances{if instance.status!="unavailable"{let _=app.asset_protocol_scope().allow_directory(std::path::Path::new(&instance.directory).join("screenshots"),true);}}}Ok(())})
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
        .invoke_handler(tauri::generate_handler![install_modpack,backend_snapshot,list_wallpapers,import_wallpaper,remove_wallpaper,clear_download_cache,storage_usage,choose_storage_folder,change_storage,open_storage_folder,save_backend_settings,reset_backend_settings,cleanup_logs,import_preferences,export_preferences,detect_java,test_java,create_local_account,switch_account,remove_account,rename_local_account,authenticate_provider,minecraft_versions,loader_versions,prepare_instance,create_instance,launch_instance,stop_instance,cancel_operation,update_instance,delete_instance,open_instance_folder,game_logs,scan_screenshots,open_screenshot,catalog_search,catalog_versions,curseforge_search,curseforge_project,curseforge_files,install_curseforge_pack,check_modpack_updates,authenticate_elyby,begin_microsoft_login,restore_accounts,content_inventory,content_worlds,content_search,content_project,content_versions,content_preview,install_content,content_action,content_rollback,content_updates,choose_content_files,inspect_content_files,import_content_files,bulk_install_content,pack_update_preview,apply_pack_update])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
