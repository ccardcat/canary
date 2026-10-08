mod installer;
mod window_material;
mod window_icon;
use window_material::{apply_window_material,window_material_capabilities};
pub mod backend;
use backend::commands::*;
use backend::game_logs::*;
use backend::discord::discord_presence_context;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
#[tauri::command]
async fn install_modpack(app:AppHandle,backend:State<'_,Arc<backend::Backend>>,project_id:String,version_id:String,name:String,task_id:Option<String>)->backend::model::Result<String>{
    use backend::{download::Job,model::*};
    let b=backend.inner().clone();let _serial=b.lease("modpack-install")?;let id=format!("{project_id}-{version_id}");let lease=b.lease(&id)?;
    let existed=b.instance_path(&id)?.exists();
    let job=Job::tracked(b.clone(),&id,"install",&name,Some(&id),Some(app.clone()),lease.cancel.clone(),task_id)?;
    job.project_identity("modrinth",&project_id,&version_id);
    let result=backend::commands::staged_work(b.clone(),&id,job.clone(),existed,async {
        if !existed{let instances=b.instance_path(&id)?.parent().unwrap().to_owned();
            installer::install_at_job(&project_id,&version_id,&name,&instances,Some(&job),|p|{
                job.files.store(p.total,std::sync::atomic::Ordering::Relaxed);job.completed.store(p.completed,std::sync::atomic::Ordering::Relaxed);job.total.store(p.bytes_total,std::sync::atomic::Ordering::Relaxed);job.downloaded.store(p.downloaded,std::sync::atomic::Ordering::Relaxed);job.emit(&p.stage,"running",&p.file);
                let _=app.emit("install-progress",p);
            }).await.map_err(|e|BackendError::new(if e.stage=="cancelled"{"cancelled"}else{"modpack"},e.to_string()))?;
        }
        let mut instance=b.instance(&id)?;let runtime=backend::minecraft::prepare(b.clone(),&instance,job.clone(),false).await?;backend::java::select(b.clone(),&instance,runtime.java_major,job.clone()).await?;job.check()?;let _=backend::download::cancellable(&job,backend::artwork::cache(&b,&mut instance)).await;job.check()?;b.save_instance(&instance)?;Ok(())
    }).await;
    job.finish(&result);result.map(|i|i.directory)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    backend::startup_phase("Canary runtime starting");
    tauri::Builder::default()
        .manage(Arc::new(backend::Backend::new().expect("Cannot initialize Canary data storage")))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            backend::startup_phase("Tauri setup entered");
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window_icon::apply(&window) {
                    eprintln!("Cannot apply Canary taskbar icon: {error}");
                }
            }
            let backend = app.state::<Arc<backend::Backend>>();
            backend::discord::Manager::start(backend.inner(), app.handle().clone());
            if let Ok(instances) = backend.instances() {
                for instance in instances {
                    if instance.status != "unavailable" {
                        let _ = app.asset_protocol_scope().allow_directory(
                            std::path::Path::new(&instance.directory).join("screenshots"), true,
                        );
                    }
                }
            }
            backend::startup_phase("Tauri setup complete");
            Ok(())
        })
        .on_window_event(|window,event| {
            if let tauri::WindowEvent::CloseRequested{api,..}=event {
                use tauri::Manager;
                let backend=window.state::<Arc<backend::Backend>>();
                if !backend.jobs.lock().unwrap().is_empty(){api.prevent_close();let _=window.emit("backend-error",backend::model::BackendError::new("tasks_running","Cancel active operations or wait for them to finish before closing Canary"));}
                if !backend.processes.lock().unwrap().is_empty(){
                    // Keep the process monitor alive; never silently kill an active world.
                    api.prevent_close();let _=window.emit("backend-error",backend::model::BackendError::new("game_running","Stop Minecraft before closing Canary"));
                }
            }
        })
        .invoke_handler(tauri::generate_handler![discord_presence_context,apply_window_material,window_material_capabilities,install_modpack,backend_snapshot,list_wallpapers,import_wallpaper,remove_wallpaper,clear_download_cache,storage_usage,choose_storage_folder,change_storage,open_storage_folder,save_backend_settings,reset_backend_settings,cleanup_logs,import_preferences,export_preferences,detect_java,test_java,create_local_account,switch_account,remove_account,rename_local_account,authenticate_provider,minecraft_versions,loader_versions,prepare_instance,create_instance,choose_mrpack_file,import_mrpack,launch_instance,stop_instance,cancel_operation,update_instance,delete_instance,open_instance_folder,game_logs,game_log_sessions,read_game_log,open_game_log,clear_activity,scan_screenshots,open_screenshot,catalog_search,catalog_versions,curseforge_search,curseforge_project,curseforge_files,install_curseforge_pack,check_modpack_updates,authenticate_elyby,begin_microsoft_login,restore_accounts,content_inventory,content_worlds,content_search,content_project,content_versions,content_preview,bulk_content_preview,install_content,content_action,content_rollback,content_updates,choose_content_files,inspect_content_files,import_content_files,bulk_install_content,pack_update_preview,apply_pack_update])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app,event|{if matches!(event,tauri::RunEvent::Exit){use tauri::Manager;app.state::<Arc<backend::Backend>>().discord.shutdown();}});
}
