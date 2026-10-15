use super::{Backend,model::*,storage,download};
use std::{path::{Path,PathBuf},sync::{Arc,atomic::Ordering}};
use tauri::{AppHandle,Manager};
use tauri_plugin_dialog::DialogExt;
fn canonical_root(path:&Path)->Result<PathBuf>{
    if !path.is_absolute()||path.parent().is_none(){return Err(BackendError::new("storage_path","Choose a dedicated absolute folder, not a drive root"));}
    for ancestor in path.ancestors(){if std::fs::symlink_metadata(ancestor).is_ok_and(|m|m.file_type().is_symlink()){return Err(BackendError::new("unsafe_path","Storage folders must not be symbolic links"));}}
    crate::backend::protected_fs::create_dir_all(path)?;let root=dunce::canonicalize(path)?;
    let probe=root.join(format!(".canary-write-test-{}",uuid::Uuid::new_v4()));super::protected_fs::create_new(&probe)?;crate::backend::protected_fs::remove_file(probe)?;Ok(root)
}
fn tree(root:&Path)->Result<Vec<(String,u64)>>{
    fn walk(root:&Path,path:&Path,out:&mut Vec<(String,u64)>)->Result<()>{for entry in std::fs::read_dir(path)?{let entry=entry?;let kind=entry.file_type()?;if kind.is_symlink(){return Err(BackendError::new("unsafe_path","An instance contains a symbolic link; migration stopped"));}if kind.is_dir(){walk(root,&entry.path(),out)?;}else if kind.is_file(){out.push((entry.path().strip_prefix(root).unwrap().to_string_lossy().replace('\\',"/"),entry.metadata()?.len()));}}Ok(())}
    let mut out=vec![];walk(root,root,&mut out)?;Ok(out)
}
fn folder_usage(root:&Path)->Result<u64>{
    if !root.exists()||std::fs::symlink_metadata(root)?.file_type().is_symlink(){return Ok(0);}
    let mut bytes=0;for entry in std::fs::read_dir(root)?{let entry=entry?;let kind=entry.file_type()?;if kind.is_dir(){bytes+=folder_usage(&entry.path())?;}else if kind.is_file(){bytes+=entry.metadata()?.len();}}Ok(bytes)
}
pub fn usage(b:&Backend)->Result<serde_json::Value>{
    let root=b.instances_root();let free=fs2::available_space(&root).ok();let mut used=0;let mut instance_logs=0;
    for instance in b.instances()?{if instance.status!="unavailable" {let directory=Path::new(&instance.directory);used+=folder_usage(directory)?;instance_logs+=folder_usage(&directory.join("logs"))?;}}
    let world_backups=folder_usage(&b.root.join("world-backups"))?;let cache=folder_usage(&b.root.join("cache"))?;let java=folder_usage(&b.root.join("java"))?;let app_logs=folder_usage(&b.root.join("logs"))?;
    Ok(serde_json::json!({"path":root,"available":root.is_dir(),"free":free,"used":used,"breakdown":{"instances":used.saturating_sub(instance_logs),"cache":cache,"java":java,"logs":app_logs+instance_logs,"world_backups":world_backups,"total":used+cache+java+app_logs+world_backups}}))
}
pub fn clear_cache(b:Arc<Backend>)->Result<()> {
    {let jobs=b.jobs.lock().unwrap();if !jobs.is_empty()||!b.processes.lock().unwrap().is_empty()||b.maintenance.swap(true,Ordering::AcqRel){return Err(BackendError::new("busy","Stop Minecraft and finish active operations before clearing cache"));}}
    let _guard=Maintenance(b.clone());let cache=storage::safe_join(&b.root,"cache")?;
    let canonical=dunce::canonicalize(&cache)?;
    for root in b.instance_roots(){let root=dunce::canonicalize(&root).unwrap_or(root);if canonical.starts_with(&root)||root.starts_with(&canonical){return Err(BackendError::new("unsafe_path","Cache overlaps registered instance storage; no files were removed"));}}
    tree(&cache)?; // Reject symlinks before touching the explicitly managed cache.
    let retired=b.root.join(format!(".cache-clear-{}",uuid::Uuid::new_v4()));
    crate::backend::protected_fs::rename(&cache,&retired)?;
    if let Err(error)=crate::backend::protected_fs::create_dir(&cache){let _=crate::backend::protected_fs::rename(&retired,&cache);return Err(error.into());}
    crate::backend::protected_fs::remove_dir_all(retired)?;Ok(())
}
pub fn choose(app:&AppHandle)->Result<Option<String>>{app.dialog().file().set_title("Canary — Instance storage").blocking_pick_folder().map(|v|v.into_path().map(|p|p.to_string_lossy().into_owned()).map_err(|_|BackendError::new("storage_path","Invalid folder"))).transpose()}
struct Maintenance(Arc<Backend>);impl Drop for Maintenance{fn drop(&mut self){self.0.maintenance.store(false,Ordering::Release);}}
pub fn change(b:Arc<Backend>,app:Option<AppHandle>,path:String,migrate:bool)->Result<serde_json::Value>{
    {let jobs=b.jobs.lock().unwrap();if !jobs.is_empty()||!b.processes.lock().unwrap().is_empty()||b.maintenance.swap(true,Ordering::AcqRel){return Err(BackendError::new("busy","Stop Minecraft and finish active operations before changing storage"));}}
    let _guard=Maintenance(b.clone());let root=canonical_root(Path::new(&path))?;
    for name in ["cache","java","logs","temp","wallpapers","world-backups","skins","fonts"]{let managed=b.root.join(name);let managed=dunce::canonicalize(&managed).unwrap_or(managed);if root.starts_with(&managed)||managed.starts_with(&root){return Err(BackendError::new("storage_path","Choose an instance folder outside Canary cache, Java, logs and internal storage"));}}
    for registered in b.instance_roots(){let registered=dunce::canonicalize(&registered).unwrap_or(registered);if root!=registered&&(root.starts_with(&registered)||registered.starts_with(&root)){return Err(BackendError::new("storage_path","Storage folders must not overlap existing instance storage"));}}
    if root==dunce::canonicalize(b.instances_root()).unwrap_or_else(|_|b.instances_root()){return usage(&b);}
    let instances=b.instances()?;if migrate&&instances.iter().any(|i|i.status=="unavailable"){return Err(BackendError::new("storage_unavailable","Reconnect every instance drive before migration"));}
    let mut staged=vec![];let mut sources=vec![];let mut published=vec![];let mut required=0;
    if migrate{for instance in &instances{let source=b.instance_path(&instance.id)?;let target=storage::safe_join(&root,&instance.id)?;if target.exists(){return Err(BackendError::new("storage_conflict","Destination already contains this instance ID"));}let files=tree(&source)?;required+=files.iter().map(|(_,size)|size).sum::<u64>();sources.push((source,target,files));}
        if fs2::available_space(&root)?<required.saturating_add(64*1024*1024){return Err(BackendError::new("disk_space","Not enough free space to copy and verify all instances"));}
        for (source,target,files) in &sources{let stage=storage::Staging(root.join(format!(".migration-{}",uuid::Uuid::new_v4())));crate::backend::protected_fs::create_dir(&stage.0)?;for (relative,size) in files{let from=storage::safe_join(source,relative)?;let to=storage::safe_join(&stage.0,relative)?;crate::backend::protected_fs::create_dir_all(to.parent().unwrap())?;crate::backend::protected_fs::copy(&from,&to)?;if std::fs::metadata(&to)?.len()!=*size||download::hash(&from,"sha256")?!=download::hash(&to,"sha256")?{return Err(BackendError::new("checksum","Storage migration verification failed. Original instances remain usable."));}}let id=target.file_name().unwrap().to_string_lossy();let mut instance=storage::instance_from_dir(&stage.0,&id)?;instance.directory=target.to_string_lossy().into();storage::write_json(&stage.0.join("instance.json"),&instance)?;staged.push(stage);}
    }
    // Publish all verified copies, then commit the routing metadata. Roll back copies on failure.
    let old=b.store.lock().unwrap().clone();let result:Result<()>= (||{for (stage,(_,target,_)) in staged.iter().zip(&sources){crate::backend::protected_fs::rename(&stage.0,target)?;published.push(target.clone());}
        {let mut store=b.store.lock().unwrap();store.settings.instances_path=Some(root.to_string_lossy().into());if migrate{store.instance_roots=vec![root.to_string_lossy().into()];for instance in &mut store.instance_catalog{instance.directory=root.join(&instance.id).to_string_lossy().into();}}else{for previous in b_roots(&old,&b.root){if !store.instance_roots.contains(&previous){store.instance_roots.push(previous);}}}}
        b.persist()?;Ok(())})();
    if let Err(error)=result{*b.store.lock().unwrap()=old;for path in published{let _=crate::backend::protected_fs::remove_dir_all(path);}return Err(error);}
    let mut retained=vec![];for (source,_,_) in sources{if crate::backend::protected_fs::remove_dir_all(&source).is_err(){retained.push(source.to_string_lossy().into_owned());}}
    if let Some(app)=app {for instance in b.instances()?{let _=app.asset_protocol_scope().allow_directory(Path::new(&instance.directory).join("screenshots"),true);}}
    Ok(serde_json::json!({"path":root,"migrated":migrate,"retained_originals":retained}))
}
fn b_roots(store:&Store,root:&Path)->Vec<String>{let mut roots=store.instance_roots.clone();roots.push(root.join("instances").to_string_lossy().into());if let Some(path)=&store.settings.instances_path{roots.push(path.clone());}roots}
#[cfg(test)]mod tests{use super::*;#[test]fn verified_migration_preserves_world_and_identity(){let root=std::env::temp_dir().join(format!("canary-storage-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root.join("app")).unwrap());let path=b.instance_path("test").unwrap();crate::backend::protected_fs::create_dir_all(path.join("saves/World")).unwrap();crate::backend::protected_fs::write(path.join("saves/World/level.dat"),b"world").unwrap();b.save_instance(&Instance{id:"test".into(),name:"Actual user instance".into(),..Instance::default()}).unwrap();change(b.clone(),None,root.join("other-drive").to_string_lossy().into(),true).unwrap();assert!(!path.exists());assert_eq!(crate::backend::protected_fs::read(b.instance_path("test").unwrap().join("saves/World/level.dat")).unwrap(),b"world");let restored=Backend::with_root(b.root.clone()).unwrap();assert_eq!(restored.instances().unwrap().len(),1);assert_eq!(restored.instance("test").unwrap().name,"Actual user instance");}#[test]fn new_only_preserves_previous_instances(){let root=std::env::temp_dir().join(format!("canary-storage-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root.join("app")).unwrap());let path=b.instance_path("original").unwrap();crate::backend::protected_fs::create_dir_all(&path).unwrap();b.save_instance(&Instance{id:"original".into(),..Instance::default()}).unwrap();change(b.clone(),None,b.instances_root().to_string_lossy().into(),true).unwrap();assert_eq!(b.instance_path("original").unwrap(),path);change(b.clone(),None,root.join("new-only").to_string_lossy().into(),false).unwrap();assert_eq!(b.instance_path("original").unwrap(),path);assert_eq!(b.instance_path("fresh").unwrap(),dunce::canonicalize(root.join("new-only")).unwrap().join("fresh"));}}

#[cfg(test)]mod failure_tests{use super::*;#[test]fn conflicting_destination_keeps_original_world_and_settings(){let root=std::env::temp_dir().join(format!("canary-storage-conflict-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root.join("app")).unwrap());let original=b.instance_path("world").unwrap();crate::backend::protected_fs::create_dir_all(original.join("saves/World")).unwrap();crate::backend::protected_fs::write(original.join("saves/World/level.dat"),b"original world").unwrap();b.save_instance(&Instance{id:"world".into(),..Instance::default()}).unwrap();let target=root.join("destination");crate::backend::protected_fs::create_dir_all(target.join("world")).unwrap();assert_eq!(change(b.clone(),None,target.to_string_lossy().into(),true).err().unwrap().code,"storage_conflict");assert!(b.settings().instances_path.is_none());assert_eq!(crate::backend::protected_fs::read(original.join("saves/World/level.dat")).unwrap(),b"original world");assert!(!b.maintenance.load(Ordering::Relaxed));}#[test]fn disconnected_drive_retains_catalog_and_blocks_launch_path(){let root=std::env::temp_dir().join(format!("canary-storage-missing-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root.join("app")).unwrap());change(b.clone(),None,root.join("drive").to_string_lossy().into(),false).unwrap();crate::backend::protected_fs::create_dir_all(b.instance_path("world").unwrap()).unwrap();b.save_instance(&Instance{id:"world".into(),..Instance::default()}).unwrap();crate::backend::protected_fs::rename(root.join("drive"),root.join("disconnected")).unwrap();assert_eq!(b.instances().unwrap()[0].status,"unavailable");assert_eq!(b.instance_path("world").err().unwrap().code,"storage_unavailable");crate::backend::protected_fs::rename(root.join("disconnected"),root.join("drive")).unwrap();assert_ne!(b.instances().unwrap()[0].status,"unavailable");}}

#[cfg(test)]mod cache_tests{use super::*;
    #[test]fn cache_cleanup_preserves_worlds_java_and_accounts_and_obeys_operations(){
        let root=std::env::temp_dir().join(format!("canary-cache-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root).unwrap());
        let instance=b.instance_path("world").unwrap();crate::backend::protected_fs::create_dir_all(instance.join("saves/World")).unwrap();crate::backend::protected_fs::create_dir_all(instance.join("logs")).unwrap();
        crate::backend::protected_fs::write(instance.join("saves/World/level.dat"),b"world").unwrap();crate::backend::protected_fs::write(instance.join("logs/latest.log"),b"log").unwrap();b.save_instance(&Instance{id:"world".into(),..Instance::default()}).unwrap();
        crate::backend::protected_fs::write(b.root.join("cache/library.jar"),b"cache").unwrap();crate::backend::protected_fs::write(b.root.join("java/java"),b"java").unwrap();super::super::accounts::local(&b,"CacheQA").unwrap();
        let sizes=usage(&b).unwrap();assert_eq!(sizes["breakdown"]["instances"],folder_usage(&instance).unwrap()-3);assert_eq!(sizes["breakdown"]["cache"],5);assert_eq!(sizes["breakdown"]["java"],4);assert_eq!(sizes["breakdown"]["logs"],3);
        let lease=b.lease("operation").unwrap();assert_eq!(clear_cache(b.clone()).unwrap_err().code,"busy");assert!(b.root.join("cache/library.jar").exists());drop(lease);
        assert_eq!(change(b.clone(),None,b.root.join("cache/instances").to_string_lossy().into(),false).unwrap_err().code,"storage_path");
        clear_cache(b.clone()).unwrap();assert!(b.root.join("cache").is_dir());assert!(!b.root.join("cache/library.jar").exists());assert_eq!(crate::backend::protected_fs::read(instance.join("saves/World/level.dat")).unwrap(),b"world");assert_eq!(crate::backend::protected_fs::read(b.root.join("java/java")).unwrap(),b"java");assert_eq!(b.store.lock().unwrap().accounts[0].username,"CacheQA");assert!(!b.maintenance.load(Ordering::Relaxed));
    }
}
