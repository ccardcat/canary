use super::{Backend,accounts,download::Job,java,minecraft,model::*,process,storage};
use std::sync::{Arc,atomic::Ordering};
use tauri::{AppHandle,State,Emitter,Manager};
type B=Arc<Backend>;
#[tauri::command]
pub async fn curseforge_search(backend:State<'_,B>,query:String,index:u32)->Result<serde_json::Value>{super::curseforge::search(&backend,query,index).await}
#[tauri::command]
pub async fn curseforge_project(backend:State<'_,B>,id:u32)->Result<serde_json::Value>{super::curseforge::project(&backend,id).await}
#[tauri::command]
pub async fn curseforge_files(backend:State<'_,B>,id:u32)->Result<serde_json::Value>{super::curseforge::files(&backend,id).await}
#[tauri::command]
pub async fn install_curseforge_pack(backend:State<'_,B>,app:AppHandle,project_id:u32,file_id:u32,task_id:Option<String>)->Result<Instance>{
    let b=backend.inner().clone();let id=format!("curseforge-{project_id}-{file_id}");let lease=b.lease(&id)?;
    let existed=b.instance_path(&id)?.exists();
    let job=Job::tracked(b.clone(),&id,"install","CurseForge",Some(&id),Some(app.clone()),lease.cancel.clone(),task_id)?;
    job.project_identity("curseforge",&project_id.to_string(),&file_id.to_string());
    let result=staged_work(b.clone(),&id,job.clone(),existed,async {if !existed{super::curseforge::install(b.clone(),project_id,file_id,job.clone()).await?;}prepare_leased(b.clone(),id.clone(),Some(app),false,job.clone()).await?;Ok(())}).await;
    job.finish(&result);result
}
#[tauri::command]
pub async fn check_modpack_updates(backend:State<'_,B>,allowed_providers:Option<Vec<String>>)->Result<serde_json::Value>{super::modpacks::updates_for_providers(backend.inner().clone(),allowed_providers.as_deref()).await}
#[tauri::command]
pub fn backend_snapshot(backend:State<'_,B>)->Result<serde_json::Value>{
    let mut instances=backend.instances()?;let store=backend.store.lock().unwrap().clone();
    let processes:std::collections::HashMap<_,_>=backend.processes.lock().unwrap().iter().map(|(id,p)|(id.clone(),p.stopping.load(Ordering::Relaxed))).collect();let preparing:std::collections::HashSet<_>=backend.jobs.lock().unwrap().keys().cloned().collect();for instance in &mut instances{if let Some(process)=processes.get(&instance.id){instance.status=if *process{"stopping"}else{"running"}.into();}else if preparing.contains(&instance.id){instance.status="preparing".into();}}
    Ok(serde_json::json!({"instances":instances,"accounts":store.accounts,"settings":store.settings,"providers":accounts::providers(),"activity":store.activity,"data_folder":backend.root,"physical_memory_mb":super::system::memory_mb(),"tasks":backend.tasks.lock().unwrap().values().map(|r|r.task.clone()).collect::<Vec<_>>()}))
}
#[tauri::command]
pub fn save_backend_settings(backend:State<'_,B>,mut settings:Settings)->Result<()> {
    if let Some(total)=super::system::memory_mb(){settings.max_memory=settings.max_memory.min(super::memory::maximum(total).max(256));settings.min_memory=settings.min_memory.min(settings.max_memory.saturating_sub(128)).max(128);}
    if !matches!(settings.memory_mode.as_str(),"auto"|"manual"){return Err(BackendError::new("memory","Unknown memory mode"));}
    super::system::validate_memory(settings.min_memory,settings.max_memory)?;
    if settings.min_memory<128||settings.max_memory<=settings.min_memory||settings.max_memory>1_048_576||!(1..=8).contains(&settings.concurrency)||settings.width<320||settings.height<240{return Err(BackendError::new("settings","Invalid memory, resolution or concurrency"));}
    if settings.instances_path!=backend.settings().instances_path{return Err(BackendError::new("storage_path","Use the storage migration dialog to change instance folders"));}
    if !(1..=32).contains(&settings.backup_retention)||!matches!(settings.log_retention_days,0|7|30|90){return Err(BackendError::new("settings","Invalid retention settings"));}
    if settings.active_account.as_ref().is_some_and(|id|!backend.store.lock().unwrap().accounts.iter().any(|a|&a.id==id)){return Err(BackendError::new("account","Default account no longer exists"));}
    backend.store.lock().unwrap().settings=settings;backend.persist()
}
#[tauri::command]
pub async fn detect_java(backend:State<'_,B>)->Result<Vec<JavaRuntime>>{java::detect(&backend.root).await}
#[tauri::command]
pub async fn test_java(path:String)->Result<JavaRuntime>{java::test(std::path::Path::new(&path),false).await}
#[tauri::command]
pub fn create_local_account(backend:State<'_,B>,username:String)->Result<Account>{accounts::local(&backend,&username)}
#[tauri::command]
pub fn switch_account(backend:State<'_,B>,id:String)->Result<()> {
    {let mut store=backend.store.lock().unwrap();if !store.accounts.iter().any(|a|a.id==id){return Err(BackendError::new("account","Account not found"));}store.settings.active_account=Some(id);}backend.persist()
}
#[tauri::command]
pub async fn remove_account(backend:State<'_,B>,id:String)->Result<()>{
 let _resource=super::account_resources::removal(&backend,&id)?;
 let account=backend.store.lock().unwrap().accounts.iter().find(|a|a.id==id).cloned();
 let _auth=if account.as_ref().is_some_and(|a|a.provider!="local"){Some(backend.auth.lock().await)}else{None};
 if let Some(a)=account.filter(|a|a.provider=="elyby") {let _=super::elyby::invalidate(&backend,&a).await;}
 accounts::remove_reserved(&backend,&id)
}
#[tauri::command]
pub fn rename_local_account(backend:State<'_,B>,id:String,username:String)->Result<()> {
    if !(3..=16).contains(&username.len())||!username.chars().all(|c|c.is_ascii_alphanumeric()||c=='_'){return Err(BackendError::new("account_name","Use 3–16 letters, numbers or underscores"));}
    {let mut store=backend.store.lock().unwrap();let account=store.accounts.iter_mut().find(|a|a.id==id&&a.provider=="local").ok_or_else(||BackendError::new("account","Local account not found"))?;account.username=username;}backend.persist()
}
#[tauri::command]
pub fn authenticate_provider(provider:String)->Result<()> {
    Err(BackendError::new("auth_not_configured",match provider.as_str(){"elyby"=>"Use the Ely.by login dialog","microsoft"=>"Use the Microsoft browser login dialog",_=>"Unknown account provider"}))
}
#[tauri::command]
pub async fn minecraft_versions(backend:State<'_,B>)->Result<serde_json::Value>{
    let metadata=minecraft::manifest(&backend).await?;let snapshots=backend.settings().snapshots;
    Ok(serde_json::json!(metadata["versions"].as_array().ok_or_else(||BackendError::new("metadata","Version list missing"))?.iter().filter(|v|snapshots||v["type"]=="release").cloned().collect::<Vec<_>>()))
}
#[tauri::command]
pub async fn loader_versions(backend:State<'_,B>,minecraft:String,loader:String)->Result<serde_json::Value>{
    if matches!(loader.as_str(),"forge"|"neoforge"){return super::loaders::versions(&backend,&minecraft,&loader).await;}
    let host=match loader.as_str(){"fabric"=>"https://meta.fabricmc.net/v2", "quilt"=>"https://meta.quiltmc.org/v3",_=>return Err(BackendError::new("loader_unsupported","This loader installer is not implemented"))};
    let mut url=reqwest::Url::parse(host).unwrap();url.path_segments_mut().unwrap().extend(["versions","loader",&minecraft]);super::download::json(&backend,url.as_str()).await
}
pub async fn staged_work(b:B,id:&str,job:Arc<Job>,existing:bool,work:impl std::future::Future<Output=Result<()>>)->Result<Instance>{
    let mut stage=super::transaction::InstanceStage::new(b,id)?;
    let result=async {if existing{stage.copy_existing(job.clone()).await?;}work.await?;stage.commit(&job)}.await;
    match stage.cleanup(){Ok(())=>result,Err(e)=>Err(BackendError::new("cleanup",format!("Incomplete staging cleanup: {e}")))}
}
pub async fn prepare_instance_inner(backend:B,id:String,app:Option<AppHandle>,deep:bool)->Result<Instance>{
    prepare_task(backend,id,app,deep,None).await
}
async fn prepare_task(b:B,id:String,app:Option<AppHandle>,deep:bool,task_id:Option<String>)->Result<Instance>{
    let instance=b.instance(&id)?;let lease=b.lease(&id)?;
    let job=Job::tracked(b.clone(),&id,if deep{"repair"}else{"install"},&instance.name,Some(&id),app.clone(),lease.cancel.clone(),task_id)?;
    let result=staged_work(b.clone(),&id,job.clone(),true,async{prepare_leased(b.clone(),id.clone(),app,deep,job.clone()).await?;Ok(())}).await;job.finish(&result);result
}
async fn prepare_leased(backend:B,id:String,_app:Option<AppHandle>,deep:bool,job:Arc<Job>)->Result<Instance>{
    job.check()?;let mut instance=backend.instance(&id)?;
    let runtime=minecraft::prepare(backend.clone(),&instance,job.clone(),deep).await?;
    java::select(backend.clone(),&instance,runtime.java_major,job.clone()).await?;job.check()?;
    let _=super::download::cancellable(&job,super::artwork::cache(&backend,&mut instance)).await;job.check()?;
    instance.status="ready".into();instance.error=None;backend.save_instance(&instance)?;Ok(instance)
}
#[tauri::command]
pub async fn prepare_instance(backend:State<'_,B>,app:AppHandle,id:String,repair:bool,task_id:Option<String>)->Result<Instance>{prepare_task(backend.inner().clone(),id,Some(app),repair,task_id).await}
#[tauri::command]
pub async fn create_instance(backend:State<'_,B>,app:AppHandle,name:String,minecraft:String,loader:String,loader_version:Option<String>,request_id:Option<String>,task_id:Option<String>)->Result<Instance>{
    if name.trim().is_empty()||name.len()>256{return Err(BackendError::new("instance","Instance name required (up to 256 characters)"));}
    let valid_version=|v:&str|!v.is_empty()&&v.len()<=96&&v.chars().all(|c|c.is_ascii_alphanumeric()||matches!(c,'.'|'-'|'_'));
    if !valid_version(&minecraft)||!matches!(loader.as_str(),"vanilla"|"fabric"|"quilt"|"forge"|"neoforge")||loader!="vanilla"&&!loader_version.as_deref().is_some_and(valid_version){return Err(BackendError::new("loader","Choose a supported Minecraft and loader version"));}
    let id=request_id.unwrap_or_else(||uuid::Uuid::new_v4().to_string());uuid::Uuid::parse_str(&id).map_err(|_|BackendError::new("instance","Invalid creation request ID"))?;
    let b=backend.inner().clone();let _creation=b.lease("create-instance")?;let lease=b.lease(&id)?;
    let existed=b.instance_path(&id)?.exists();
    let job=Job::tracked(b.clone(),&id,"install",name.trim(),Some(&id),Some(app.clone()),lease.cancel.clone(),task_id)?;
    let result=if existed{Err(BackendError::new("content_duplicate","This creation request already has an instance"))}else{staged_work(b.clone(),&id,job.clone(),false,async{
        let dir=b.instance_path(&id)?;std::fs::create_dir(&dir)?;for folder in ["mods","config","resourcepacks","shaderpacks","saves","screenshots","logs"]{std::fs::create_dir_all(dir.join(folder))?;}
        b.save_instance(&Instance{id:id.clone(),name:name.trim().into(),minecraft,loader,loader_version,provider:"vanilla".into(),directory:dir.to_string_lossy().into(),status:"installing".into(),..Instance::default()})?;
        prepare_leased(b.clone(),id.clone(),Some(app),false,job.clone()).await?;Ok(())
    }).await};job.finish(&result);result
}
#[tauri::command]
pub async fn choose_mrpack_file(app:AppHandle)->Result<Option<super::mrpack_import::Preview>>{
    tokio::task::spawn_blocking(move||{use tauri_plugin_dialog::DialogExt;
        let Some(file)=app.dialog().file().add_filter("Modrinth pack",&["mrpack"]).blocking_pick_file() else{return Ok(None)};
        let path=file.into_path().map_err(|_|BackendError::new("mrpack_archive","Invalid archive path"))?;
        super::mrpack_import::inspect(&path).map(Some)
    }).await.map_err(|_|BackendError::new("mrpack_archive","Cannot inspect the chosen archive"))?
}
#[tauri::command]
pub async fn import_mrpack(backend:State<'_,B>,app:AppHandle,path:String,expected_hash:String,name:Option<String>,request_id:String,task_id:Option<String>)->Result<Instance>{
    uuid::Uuid::parse_str(&request_id).map_err(|_|BackendError::new("mrpack_archive","Invalid import request ID"))?;
    let b=backend.inner().clone();let _creation=b.lease("create-instance")?;let lease=b.lease(&request_id)?;
    let existed=b.instance_path(&request_id)?.exists();
    let job=Job::tracked(b.clone(),&request_id,"install",name.as_deref().unwrap_or("MRPACK"),Some(&request_id),Some(app.clone()),lease.cancel.clone(),task_id)?;
    let result=if existed{Err(BackendError::new("content_duplicate","This import request already has an instance"))}else{staged_work(b.clone(),&request_id,job.clone(),false,async{
        let instance=super::mrpack_import::import(b.clone(),path.into(),expected_hash,name,job.clone()).await?;
        prepare_leased(b.clone(),instance.id,Some(app),false,job.clone()).await?;Ok(())
    }).await};job.finish(&result);result
}
#[tauri::command]
pub async fn launch_instance(backend:State<'_,B>,app:AppHandle,id:String,task_id:Option<String>)->Result<u32>{
    let instance=backend.instance(&id)?;let lease=backend.lease(&id)?;let cancel=lease.cancel.clone();let job=Job::tracked(backend.inner().clone(),&id,"launch",&instance.name,Some(&id),Some(app.clone()),cancel,task_id)?;
    let result=process::launch(backend.inner().clone(),instance,job.clone(),Some(app.clone())).await;job.finish(&result);let _=app.emit("instances-changed",());result
}
#[tauri::command]
pub async fn stop_instance(backend:State<'_,B>,id:String,force:bool)->Result<()>{process::stop(&backend,&id,force).await}
#[tauri::command]
pub fn cancel_operation(backend:State<'_,B>,app:AppHandle,id:String)->Result<()>{
    if super::activity::cancel(&backend,&id,Some(&app))?{return Ok(());}
    let task=backend.tasks.lock().unwrap().values().find(|r|r.task.operation_id==id&&!super::activity::terminal(&r.task.status)).map(|r|r.task.id.clone());
    if let Some(task)=task{super::activity::cancel(&backend,&task,Some(&app))?;return Ok(());}
    let job=backend.jobs.lock().unwrap().get(&id).cloned().or_else(||backend.provider_requests.lock().unwrap().get(&id).cloned()).ok_or_else(||BackendError::new("operation","Operation not found"))?;job.store(true,Ordering::Relaxed);Ok(())
}
#[tauri::command]
pub fn update_instance(backend:State<'_,B>,mut instance:Instance)->Result<Instance>{
    let _lease=backend.inner().lease(&instance.id)?;let mut old=backend.instance(&instance.id)?;
    if instance.name.trim().is_empty(){return Err(BackendError::new("instance","Instance name required"));}
    if instance.overrides.memory_mode.as_deref().is_some_and(|mode|!matches!(mode,"auto"|"manual")){return Err(BackendError::new("memory","Unknown memory mode"));}
    let settings=backend.settings();if let (Some(total),Some(saved))=(super::system::memory_mb(),instance.overrides.max_memory){instance.overrides.max_memory=Some(saved.min(super::memory::maximum(total).max(256)));}let (min,max,_)=super::memory::resolve(&settings,&instance,super::system::memory_mb());super::system::validate_memory(min,max)?;if instance.overrides.width.is_some_and(|n|n<320)||instance.overrides.height.is_some_and(|n|n<240){return Err(BackendError::new("settings","Resolution is too small"));}
    old.name=instance.name;old.icon=instance.icon;old.favorite=instance.favorite;old.overrides=instance.overrides;backend.normalize_account(&mut old);backend.save_instance(&old)?;Ok(old)
}
#[tauri::command]
pub fn delete_instance(backend:State<'_,B>,id:String,confirmed:bool)->Result<()> {
    if !confirmed{return Err(BackendError::new("confirmation","Confirm deletion of this instance and its worlds"));}let path=backend.instance_path(&id)?;
    let _lease=backend.inner().lease(&id)?;let name=backend.instance(&id)?.name;
    let managed=std::fs::canonicalize(path.parent().unwrap())?;let real=std::fs::canonicalize(&path)?;if real.parent()!=Some(managed.as_path()){return Err(BackendError::new("unsafe_path","Instance is outside the managed root"));}std::fs::remove_dir_all(real)?;backend.store.lock().unwrap().instance_catalog.retain(|i|i.id!=id);backend.record_activity("instance_removed",&name,Some(&id))?;Ok(())
}
#[tauri::command]
pub fn open_instance_folder(backend:State<'_,B>,app:AppHandle,id:String,folder:String)->Result<()> {
    use tauri_plugin_opener::OpenerExt;let dir=backend.instance_path(&id)?;
    if !matches!(folder.as_str(),""|"mods"|"shaderpacks"|"resourcepacks"|"saves"|"screenshots"|"logs"|"config"){return Err(BackendError::new("unsafe_path","Unsupported instance folder"));}
    let path=if folder.is_empty(){dir}else{storage::safe_join(&dir,&folder)?};app.opener().open_path(path.to_string_lossy(),None::<&str>).map_err(|e|BackendError::new("open_folder",e.to_string()))
}
#[tauri::command]
pub fn game_logs(backend:State<'_,B>,id:String)->Result<String>{
    let root=backend.instance_path(&id)?;let folder=storage::safe_join(&root,"logs")?;
    let mut logs:Vec<_>=std::fs::read_dir(folder)?.filter_map(|e|e.ok()).filter(|e|e.file_name().to_string_lossy().starts_with("canary-")&&e.path().extension().is_some_and(|x|x=="log")).collect();logs.sort_by_key(|e|e.file_name());
    if let Some(log)=logs.last(){let path=storage::safe_join(&root,&format!("logs/{}",log.file_name().to_string_lossy()))?;let data=std::fs::read(path)?;return Ok(String::from_utf8_lossy(&data[data.len().saturating_sub(256*1024)..]).into());}Ok(String::new())
}
#[tauri::command]
pub fn scan_screenshots(backend:State<'_,B>,app:AppHandle)->Result<serde_json::Value>{let mut images=vec![];for instance in backend.instances()?{
    if instance.status=="unavailable"{continue;}let root=backend.instance_path(&instance.id)?;let folder=storage::safe_join(&root,"screenshots")?;let _=app.asset_protocol_scope().allow_directory(&folder,true);
    if let Ok(entries)=std::fs::read_dir(folder){for entry in entries.flatten(){let path=storage::safe_join(&root,&format!("screenshots/{}",entry.file_name().to_string_lossy()))?;if path.extension().is_some_and(|e|matches!(e.to_string_lossy().to_lowercase().as_str(),"png"|"jpg"|"jpeg")){let metadata=entry.metadata()?;images.push(serde_json::json!({"instance":instance.id,"name":instance.name,"path":path,"size":metadata.len(),"timestamp":metadata.modified().ok().and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d|d.as_secs())}));}}}
}Ok(serde_json::json!(images))}
#[tauri::command]
pub fn open_screenshot(backend:State<'_,B>,app:AppHandle,id:String,name:String)->Result<()>{use tauri_plugin_opener::OpenerExt;let path=super::artwork::screenshot(&backend,&id,&name)?;app.opener().open_path(path.to_string_lossy(),None::<&str>).map_err(|e|BackendError::new("open_folder",e.to_string()))}

#[tauri::command]
pub async fn authenticate_elyby(backend:State<'_,B>,username:String,password:String,otp:Option<String>)->Result<Account>{super::elyby::authenticate(&backend,username,password,otp).await}
#[tauri::command]
pub async fn restore_accounts(backend:State<'_,B>)->Result<()>{{super::elyby::restore(&backend).await?;super::microsoft::restore(&backend).await;Ok(())}}

#[tauri::command]
pub async fn content_inventory(backend:State<'_,B>,id:String)->Result<super::content::State>{let b=backend.inner().clone();tokio::task::spawn_blocking(move||{if b.jobs.lock().unwrap().contains_key(&id)||b.processes.lock().unwrap().contains_key(&id){return super::content::load(&b.instance_path(&id)?);}let _lease=b.lease(&id)?;super::content::scan(&b,&id)}).await.map_err(|e|BackendError::new("content_scan",e.to_string()))?}
#[tauri::command]
pub fn content_worlds(backend:State<'_,B>,id:String)->Result<Vec<serde_json::Value>>{super::content::worlds(&backend.instance_path(&id)?)}
async fn provider_request<T>(backend:&B,id:Option<String>,future:impl std::future::Future<Output=Result<T>>)->Result<T>{
    let Some(id)=id else{return future.await;};
    if id.strip_prefix("provider-").and_then(|value|uuid::Uuid::parse_str(value).ok()).is_none(){return Err(BackendError::new("provider_request","Invalid provider request ID"));}
    struct RequestLease{backend:B,id:String}
    impl Drop for RequestLease{fn drop(&mut self){self.backend.provider_requests.lock().unwrap().remove(&self.id);}}
    // Read-only catalog requests must not block launcher closing or storage migration.
    let cancel=Arc::new(std::sync::atomic::AtomicBool::new(false));
    {let mut requests=backend.provider_requests.lock().unwrap();if requests.contains_key(&id){return Err(BackendError::new("busy","Provider request already active"));}requests.insert(id.clone(),cancel.clone());}
    let _lease=RequestLease{backend:backend.clone(),id:id.clone()};let job=Job::new(&id,None,cancel);
    super::download::cancellable(&job,future).await
}
#[cfg(test)]mod provider_cancel_test{
    use super::*;
    #[tokio::test]async fn cancelled_provider_request_drops_future_and_releases_job(){
        let root=std::env::temp_dir().join(format!("canary-provider-cancel-{}",uuid::Uuid::new_v4()));
        let _cleanup=storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root).unwrap());
        let id=format!("provider-{}",uuid::Uuid::new_v4());let task_backend=b.clone();let task_id=id.clone();
        let task=tokio::spawn(async move{provider_request(&task_backend,Some(task_id),std::future::pending::<Result<serde_json::Value>>()).await});
        for _ in 0..50{if b.provider_requests.lock().unwrap().contains_key(&id){break;}tokio::time::sleep(std::time::Duration::from_millis(10)).await;}
        assert!(b.jobs.lock().unwrap().is_empty());
        b.provider_requests.lock().unwrap().get(&id).unwrap().store(true,std::sync::atomic::Ordering::Relaxed);
        let result=tokio::time::timeout(std::time::Duration::from_secs(2),task).await.unwrap().unwrap().unwrap_err();
        assert_eq!(result.code,"cancelled");assert!(!b.provider_requests.lock().unwrap().contains_key(&id));
    }
}
#[tauri::command]
pub async fn content_search(backend:State<'_,B>,id:String,kind:String,query:String,sort:String,offset:u32,strict:bool,provider:Option<String>,request_id:Option<String>)->Result<serde_json::Value>{provider_request(&backend,request_id,async{let i=backend.instance(&id)?;match provider.as_deref().unwrap_or("modrinth"){"modrinth"=>super::content_provider::search(&backend,&i,&kind,&query,&sort,offset,strict).await,"curseforge"=>super::curseforge_content::search(&backend,&kind,&query,&sort,offset,20,if strict{&i.minecraft}else{""},if strict{&i.loader}else{""}).await,_=>Err(BackendError::new("provider","Unknown provider"))}}).await}
#[tauri::command]
pub async fn content_project(backend:State<'_,B>,project:String,provider:Option<String>,request_id:Option<String>)->Result<serde_json::Value>{provider_request(&backend,request_id,async{if provider.as_deref()==Some("curseforge"){super::curseforge_content::detail(&backend,&project).await}else{super::content_provider::detail(&backend,&project).await}}).await}
#[tauri::command]
pub async fn content_versions(backend:State<'_,B>,id:String,project:String,kind:String,beta:bool,provider:Option<String>,request_id:Option<String>)->Result<Vec<serde_json::Value>>{provider_request(&backend,request_id,async{super::content_provider::provider_versions(&backend,provider.as_deref().unwrap_or("modrinth"),&backend.instance(&id)?,&project,&kind,beta).await}).await}
#[tauri::command]
pub async fn content_preview(backend:State<'_,B>,id:String,project:String,version:Option<String>,kind:String,world:Option<String>,beta:bool,provider:Option<String>)->Result<super::content_provider::Plan>{let _lease=backend.inner().lease(&id)?;super::content_provider::identify(&backend,&id).await?;super::content_provider::provider_preview(&backend,provider.as_deref().unwrap_or("modrinth"),&backend.instance(&id)?,&project,version.as_deref(),&kind,world,beta).await}
#[tauri::command]
pub async fn install_content(backend:State<'_,B>,app:AppHandle,id:String,project:String,version:Option<String>,kind:String,world:Option<String>,beta:bool,fingerprint:String,provider:Option<String>,task_id:Option<String>)->Result<super::content::State>{
 let lease=backend.inner().lease(&id)?;let job=Job::tracked(backend.inner().clone(),&id,"install",&backend.instance(&id)?.name,Some(&id),Some(app.clone()),lease.cancel.clone(),task_id)?;job.content_history.store(true,Ordering::Relaxed);
 let result=async {let instance=backend.instance(&id)?;job.emit("content_resolve","running",&project);let plan=super::download::cancellable(&job,super::content_provider::provider_preview(&backend,provider.as_deref().unwrap_or("modrinth"),&instance,&project,version.as_deref(),&kind,world,beta)).await?;if plan.fingerprint!=fingerprint{return Err(BackendError::new("content_plan_changed","Install plan changed; review it again"));}super::content_provider::install(backend.inner().clone(),&id,plan,job.clone()).await}.await;
 job.finish(&result);let _=app.emit("content-changed",serde_json::json!({"id":id}));result
}
#[tauri::command]
pub async fn content_action(backend:State<'_,B>,app:AppHandle,id:String,ids:Vec<String>,action:String)->Result<super::content::State>{let b=backend.inner().clone();let event_id=id.clone();let result=tokio::task::spawn_blocking(move||{let _lease=b.lease(&id)?;super::content::mutate(&b,&id,&ids,&action)}).await.map_err(|e|BackendError::new("content_action",e.to_string()))?;let _=app.emit("content-changed",serde_json::json!({"id":event_id}));result}
#[tauri::command]
pub async fn content_rollback(backend:State<'_,B>,app:AppHandle,id:String)->Result<super::content::State>{let b=backend.inner().clone();let event_id=id.clone();let result=tokio::task::spawn_blocking(move||{let _lease=b.lease(&id)?;super::content::rollback(&b,&id)}).await.map_err(|e|BackendError::new("content_snapshot",e.to_string()))?;let _=app.emit("content-changed",serde_json::json!({"id":event_id}));result}
#[tauri::command]
pub async fn content_updates(backend:State<'_,B>,id:String,beta:bool,allowed_providers:Option<Vec<String>>)->Result<super::content::State>{let _lease=backend.inner().lease(&id)?;super::content_provider::updates_for_providers(&backend,&id,beta,allowed_providers.as_deref()).await}
#[tauri::command]
pub async fn choose_content_files(app:AppHandle)->Result<Vec<String>>{
 tokio::task::spawn_blocking(move||{use tauri_plugin_dialog::DialogExt;Ok(app.dialog().file().add_filter("Minecraft content",&["jar","zip"]).blocking_pick_files().unwrap_or_default().into_iter().filter_map(|p|p.into_path().ok().map(|p|p.to_string_lossy().into_owned())).collect())}).await.map_err(|e|BackendError::new("content_file",e.to_string()))?
}
#[tauri::command]
pub async fn inspect_content_files(backend:State<'_,B>,id:String,paths:Vec<String>)->Result<Vec<super::content::Inspection>>{let b=backend.inner().clone();tokio::task::spawn_blocking(move||{let i=b.instance(&id)?;paths.iter().map(|p|super::content::inspect(std::path::Path::new(p),&i)).collect()}).await.map_err(|e|BackendError::new("content_file",e.to_string()))?}
#[tauri::command]
pub async fn import_content_files(backend:State<'_,B>,app:AppHandle,id:String,paths:Vec<String>,world:Option<String>,task_id:Option<String>)->Result<super::content::State>{let b=backend.inner().clone();let lease=b.lease(&id)?;let job=Job::tracked(backend.inner().clone(),&id,"install",&backend.instance(&id)?.name,Some(&id),Some(app.clone()),lease.cancel.clone(),task_id)?;job.content_history.store(true,Ordering::Relaxed);let worker_job=job.clone();let event_id=id.clone();let result=tokio::task::spawn_blocking(move||{let _lease=lease;super::content_provider::import_with_job(&b,&id,paths,world,Some(&worker_job))}).await.unwrap_or_else(|e|Err(BackendError::new("content_file",e.to_string())));job.finish(&result);let _=app.emit("content-changed",serde_json::json!({"id":event_id}));result}

#[derive(serde::Deserialize)]
pub struct ContentRequest {#[serde(default="super::content::default_provider")]provider:String,project:String,version:Option<String>,kind:String,world:Option<String>,beta:bool,#[serde(default)]fingerprint:String}
#[tauri::command]
pub async fn bulk_content_preview(backend:State<'_,B>,id:String,requests:Vec<ContentRequest>)->Result<Vec<super::content_provider::Plan>>{
 if requests.is_empty()||requests.len()>100{return Err(BackendError::new("dependency","Select between 1 and 100 projects"));}
 let _lease=backend.inner().lease(&id)?;super::content_provider::identify(&backend,&id).await?;let instance=backend.instance(&id)?;let mut plans=Vec::new();
 for r in requests{plans.push(super::content_provider::provider_preview(&backend,&r.provider,&instance,&r.project,r.version.as_deref(),&r.kind,r.world,r.beta).await?);}
 Ok(plans)
}
#[tauri::command]
pub async fn bulk_install_content(backend:State<'_,B>,app:AppHandle,id:String,requests:Vec<ContentRequest>,task_id:Option<String>)->Result<super::content::State>{
 let lease=backend.inner().lease(&id)?;let job=Job::tracked(backend.inner().clone(),&id,"install",&backend.instance(&id)?.name,Some(&id),Some(app.clone()),lease.cancel.clone(),task_id)?;job.content_history.store(true,Ordering::Relaxed);
 let result=async{let instance=backend.instance(&id)?;let mut plans=vec![];if requests.len()>100{return Err(BackendError::new("dependency","Too many projects"));}for r in requests{job.check()?;job.emit("content_resolve","running",&r.project);let p=super::download::cancellable(&job,super::content_provider::provider_preview(&backend,&r.provider,&instance,&r.project,r.version.as_deref(),&r.kind,r.world,r.beta)).await?;if p.fingerprint!=r.fingerprint{return Err(BackendError::new("content_plan_changed","Install plan changed"));}plans.push(p);}super::content_provider::install_many(backend.inner().clone(),&id,plans,job.clone()).await}.await;
 job.finish(&result);let _=app.emit("content-changed",serde_json::json!({"id":id}));result
}

#[tauri::command]
pub async fn pack_update_preview(backend:State<'_,B>,id:String,beta:bool)->Result<super::pack_update::Preview>{let _lease=backend.inner().lease(&id)?;super::pack_update::preview(&backend,&id,beta).await}
#[tauri::command]
pub async fn apply_pack_update(backend:State<'_,B>,app:AppHandle,id:String,beta:bool,fingerprint:String,task_id:Option<String>)->Result<super::content::State>{let lease=backend.inner().lease(&id)?;let job=Job::tracked(backend.inner().clone(),&id,"update",&backend.instance(&id)?.name,Some(&id),Some(app.clone()),lease.cancel.clone(),task_id)?;let result=super::pack_update::install(backend.inner().clone(),&id,beta,&fingerprint,job.clone()).await;job.finish(&result);let _=app.emit("content-changed",serde_json::json!({"id":id}));result}

#[tauri::command]
pub async fn begin_microsoft_login(app:AppHandle,backend:State<'_,B>)->Result<serde_json::Value>{super::microsoft::begin(backend.inner().clone(),app).await}

#[tauri::command]pub async fn clear_download_cache(backend:State<'_,B>)->Result<()>{let b=backend.inner().clone();tokio::task::spawn_blocking(move||super::storage_settings::clear_cache(b)).await.map_err(|_|BackendError::new("storage","Cache cleanup failed"))?}
#[tauri::command]pub async fn storage_usage(backend:State<'_,B>)->Result<serde_json::Value>{let b=backend.inner().clone();tokio::task::spawn_blocking(move||super::storage_settings::usage(&b)).await.map_err(|_|BackendError::new("storage","Storage scan failed"))?}
#[tauri::command]pub async fn choose_storage_folder(app:AppHandle)->Result<Option<String>>{tokio::task::spawn_blocking(move||super::storage_settings::choose(&app)).await.map_err(|_|BackendError::new("storage","Folder picker failed"))?}
#[tauri::command]pub async fn change_storage(backend:State<'_,B>,app:AppHandle,path:String,migrate:bool)->Result<serde_json::Value>{let b=backend.inner().clone();tokio::task::spawn_blocking(move||super::storage_settings::change(b,Some(app),path,migrate)).await.map_err(|_|BackendError::new("storage","Storage migration failed"))?}
#[tauri::command]pub fn open_storage_folder(backend:State<'_,B>,app:AppHandle)->Result<()>{use tauri_plugin_opener::OpenerExt;app.opener().open_path(backend.instances_root().to_string_lossy(),None::<&str>).map_err(|_|BackendError::new("open_folder","Cannot open storage folder"))}

#[tauri::command]pub async fn catalog_search(backend:State<'_,B>,kind:String,query:String,sort:String,offset:u32,limit:u32,game:String,loader:String,request_id:Option<String>)->Result<serde_json::Value>{provider_request(&backend,request_id,async{super::curseforge_content::search(&backend,&kind,&query,&sort,offset,limit,&game,&loader).await}).await}
#[tauri::command]pub async fn catalog_versions(backend:State<'_,B>,project:String,kind:String,request_id:Option<String>)->Result<Vec<serde_json::Value>>{provider_request(&backend,request_id,async{super::curseforge_content::versions(&backend,&project,&kind,"","",true).await}).await}

#[tauri::command]pub fn reset_backend_settings(backend:State<'_,B>)->Result<()>{let old=backend.settings();backend.store.lock().unwrap().settings=Settings{instances_path:old.instances_path,active_account:old.active_account,..Settings::default()};backend.persist()}
#[tauri::command]pub async fn cleanup_logs(backend:State<'_,B>)->Result<u32>{let b=backend.inner().clone();tokio::task::spawn_blocking(move||{let days=b.settings().log_retention_days;if days==0{return Ok(0);}let cutoff=now().saturating_sub(days as u64*86400);let mut removed=0;for instance in b.instances()?{if instance.status=="unavailable"||b.processes.lock().unwrap().contains_key(&instance.id){continue;}let root=b.instance_path(&instance.id)?;if let Ok(entries)=std::fs::read_dir(root.join("logs")){for entry in entries.flatten(){let name=entry.file_name().to_string_lossy().into_owned();if entry.file_type()?.is_file()&&name.starts_with("canary-")&&name.ends_with(".log")&&entry.metadata()?.modified()?.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs()<cutoff{std::fs::remove_file(storage::safe_join(&root,&format!("logs/{name}"))?)?;removed+=1;}}}}Ok(removed)}).await.map_err(|_|BackendError::new("logs","Log cleanup failed"))?}
#[tauri::command]pub async fn export_preferences(backend:State<'_,B>,app:AppHandle)->Result<()>{let mut settings=backend.settings();settings.instances_path=None;settings.active_account=None;tokio::task::spawn_blocking(move||{use tauri_plugin_dialog::DialogExt;if let Some(file)=app.dialog().file().add_filter("Canary preferences",&["json"]).set_file_name("canary-preferences.json").blocking_save_file(){let path=file.into_path().map_err(|_|BackendError::new("settings","Invalid preference file"))?;storage::write_json(&path,&settings)?;}Ok(())}).await.map_err(|_|BackendError::new("settings","Preference export failed"))?}
#[tauri::command]pub async fn import_preferences(backend:State<'_,B>,app:AppHandle)->Result<()>{let b=backend.inner().clone();tokio::task::spawn_blocking(move||{use tauri_plugin_dialog::DialogExt;if let Some(file)=app.dialog().file().add_filter("Canary preferences",&["json"]).blocking_pick_file(){let path=file.into_path().map_err(|_|BackendError::new("settings","Invalid preference file"))?;if std::fs::metadata(&path)?.len()>1024*1024{return Err(BackendError::new("settings","Preference file too large"));}let mut settings:Settings=serde_json::from_slice(&std::fs::read(path)?)?;super::system::validate_memory(settings.min_memory,settings.max_memory)?;if !(1..=8).contains(&settings.concurrency)||!(1..=32).contains(&settings.backup_retention)||!matches!(settings.log_retention_days,0|7|30|90)||settings.width<320||settings.height<240{return Err(BackendError::new("settings","Invalid preference values"));}let old=b.settings();settings.instances_path=old.instances_path;settings.active_account=old.active_account;b.store.lock().unwrap().settings=settings;b.persist()?;}Ok(())}).await.map_err(|_|BackendError::new("settings","Preference import failed"))?}

#[tauri::command]pub fn list_wallpapers(backend:State<'_,B>)->Result<Vec<super::wallpapers::Wallpaper>>{super::wallpapers::list(&backend)}
#[tauri::command]pub async fn import_wallpaper(backend:State<'_,B>,app:AppHandle,target:String)->Result<Option<super::wallpapers::Wallpaper>>{let b=backend.inner().clone();tokio::task::spawn_blocking(move||{use tauri_plugin_dialog::DialogExt;if let Some(file)=app.dialog().file().add_filter("Background image",&["png","jpg","jpeg","webp"]).blocking_pick_file(){let path=file.into_path().map_err(|_|BackendError::new("wallpaper","Invalid image path"))?;return Ok(Some(super::wallpapers::import_file(&b,&path,&target)?));}Ok(None)}).await.map_err(|_|BackendError::new("wallpaper","Background import failed"))?}
#[tauri::command]pub fn remove_wallpaper(backend:State<'_,B>,id:String)->Result<()>{super::wallpapers::remove(&backend,&id)}
