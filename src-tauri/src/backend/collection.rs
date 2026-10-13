//! Local collection tools. All writes use the same no-follow and staged commit
//! policy as installation; a running instance can never be copied or restored.
use super::{Backend, download::Job, model::*, protected_fs as fs, storage};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, io::{Read, Write}, path::{Path, PathBuf}, sync::{Arc, atomic::Ordering}};
use tauri::{AppHandle, State};
type B = Arc<Backend>;
fn allow_screenshots(app:&AppHandle,value:&Instance){use tauri::Manager;let _=app.asset_protocol_scope().allow_directory(Path::new(&value.directory).join("screenshots"),true);}

#[derive(Clone, Deserialize)]
#[serde(default)]
pub struct CopyOptions { pub worlds:bool, pub settings:bool, pub screenshots:bool }
impl Default for CopyOptions { fn default()->Self { Self{worlds:false,settings:true,screenshots:false} } }
fn name(value:&str)->Result<String>{let value=value.trim();if value.is_empty()||value.chars().count()>128||value.chars().any(char::is_control){return Err(BackendError::new("collection_name","Enter a name of up to 128 characters"));}Ok(value.into())}
fn playable_version(value:&str)->bool{!value.is_empty()&&value.len()<96&&value.chars().all(|c|c.is_ascii_alphanumeric()||matches!(c,'.'|'-'|'_'))}
fn game_file(rel:&str,options:&CopyOptions)->bool{
    let root=rel.split('/').next().unwrap_or("");
    if root=="saves"&&rel.ends_with("/session.lock"){return false;}
    match root {
        "saves"=>options.worlds,"screenshots"=>options.screenshots,
        "config"|"defaultconfigs"|"options.txt"|"optionsof.txt"|"optionsshaders.txt"|"servers.dat"=>options.settings,
        "mods"|"resourcepacks"|"shaderpacks"|"datapacks"|"kubejs"|"scripts"|"resources"|"patchouli_books"|"global_packs"|"openloader"|"journeymap"|"XaeroWaypoints"|"XaeroWorldMap"=>true,
        _=>false,
    }
}
fn files(base:&Path,filter:&impl Fn(&str)->bool,job:&Job)->Result<Vec<(String,u64)>>{
    fn visit(base:&Path,rel:&str,depth:u8,filter:&impl Fn(&str)->bool,job:&Job,out:&mut Vec<(String,u64)>,budget:&mut storage::ExtractionBudget)->Result<()> {
        job.check()?;if depth>64{return Err(BackendError::new("archive_limit","Folder nesting is too deep"));}
        let dir=if rel.is_empty(){base.to_owned()}else{storage::safe_join(base,rel)?};fs::directory(&dir,false)?;
        for entry in std::fs::read_dir(dir)? {job.check()?;let entry=entry?;let leaf=entry.file_name().into_string().map_err(|_|BackendError::new("unsafe_path","Filename is not UTF-8"))?;let relative=if rel.is_empty(){leaf}else{format!("{rel}/{leaf}")};if !filter(&relative){continue;}
            let path=storage::safe_join(base,&relative)?;let kind=entry.file_type()?;
            if kind.is_dir(){visit(base,&relative,depth+1,filter,job,out,budget)?;}else if kind.is_file(){let size=fs::open(path)?.metadata()?.len();budget.entry(size)?;out.push((relative,size));}else{return Err(BackendError::new("unsafe_path","Links and special files cannot be copied"));}
        }Ok(())
    }
    let mut out=vec![];visit(base,"",0,filter,job,&mut out,&mut storage::ExtractionBudget::new(storage::ExtractionLimits::default()))?;out.sort_by(|a,b|a.0.cmp(&b.0));Ok(out)
}
fn progress(job:&Job,items:&[(String,u64)]){job.downloaded.store(0,Ordering::Relaxed);job.completed.store(0,Ordering::Relaxed);job.files.store(items.len() as u64,Ordering::Relaxed);job.total.store(items.iter().map(|i|i.1).sum(),Ordering::Relaxed);}
fn world_locks(source:&Path)->Result<Vec<std::fs::File>>{
    let saves=storage::safe_join(source,"saves")?;if !saves.is_dir(){return Ok(vec![])};fs::directory(&saves,false)?;let mut locks=vec![];
    for entry in std::fs::read_dir(saves)?{let entry=entry?;if !entry.file_type()?.is_dir(){continue;}let lock=entry.path().join("session.lock");if lock.is_file(){let file=fs::open(lock)?;
        #[cfg(target_os="linux")]let locked={use std::os::fd::AsRawFd;let mut record:libc::flock=unsafe{std::mem::zeroed()};record.l_type=libc::F_RDLCK as _;record.l_whence=libc::SEEK_SET as _;(unsafe{libc::fcntl(file.as_raw_fd(),libc::F_SETLK,&record)})==0};
        #[cfg(not(target_os="linux"))]let locked=fs2::FileExt::try_lock_exclusive(&file).is_ok();
        if !locked{return Err(BackendError::new("game_running","A world is open in another Minecraft process. Close it before copying or backing up."));}locks.push(file);}}
    Ok(locks)
}
fn stream(job:&Job,from:&mut impl Read,to:&mut impl Write)->Result<()> {let mut buf=[0u8;128*1024];loop{job.check()?;let n=from.read(&mut buf)?;if n==0{break;}to.write_all(&buf[..n])?;job.downloaded.fetch_add(n as u64,Ordering::Relaxed);}Ok(())}
fn copy_files(source:&Path,target:&Path,options:&CopyOptions,job:&Job)->Result<()> {
    let _world_locks=if options.worlds{world_locks(source)?}else{vec![]};
    let items=files(source,&|rel|game_file(rel,options),job)?;progress(job,&items);
    if fs2::available_space(target).is_ok_and(|free|free<items.iter().map(|i|i.1).sum::<u64>()+64*1024*1024){return Err(BackendError::new("disk_space","Not enough free space for this copy"));}
    for (rel,_) in items {let mut input=fs::open(storage::safe_join(source,&rel)?)?;let mut output=fs::create(storage::safe_join(target,&rel)?)?;stream(job,&mut input,&mut output)?;output.sync_all()?;job.completed.fetch_add(1,Ordering::Relaxed);job.emit("copying","running",&rel);}Ok(())
}
fn archive(source:&Path,target:&Path,items:&[(String,u64)],prefix:&str,manifest:Option<&serde_json::Value>,job:&Job)->Result<()> {
    let parent=fs::Parent::new(target,true)?;let (temporary,file)=parent.temporary()?;let _partial=parent.guard(&temporary)?;
    let mut writer=zip::ZipWriter::new(file);let options=zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    if let Some(manifest)=manifest {writer.start_file("modrinth.index.json",options).map_err(|e|BackendError::new("archive",e.to_string()))?;writer.write_all(&serde_json::to_vec_pretty(manifest)?)?;}
    progress(job,items);
    for (rel,_) in items {job.check()?;writer.start_file(format!("{prefix}{rel}"),options).map_err(|e|BackendError::new("archive",e.to_string()))?;stream(job,&mut fs::open(storage::safe_join(source,rel)?)?,&mut writer)?;job.completed.fetch_add(1,Ordering::Relaxed);job.emit("archiving","running",rel);}
    let file=writer.finish().map_err(|e|BackendError::new("archive",e.to_string()))?;file.sync_all()?;drop(file);job.check()?;parent.commit(&temporary)?;Ok(())
}
pub fn clone_local(b:B,id:&str,new_name:&str,options:CopyOptions,job:&Job)->Result<Instance>{
    let source=b.instance(id)?;let source_path=b.instance_path(id)?;let new_id=uuid::Uuid::new_v4().to_string();let _creation=b.lease("create-instance")?;let _target=b.lease(&new_id)?;
    let mut stage=super::transaction::InstanceStage::new(b.clone(),&new_id)?;fs::create_dir_all(&stage.path)?;copy_files(&source_path,&stage.path,&options,job)?;
    let disabled=files(&source_path,&|rel|rel==".canary-content"||rel==".canary-content/disabled"||rel.starts_with(".canary-content/disabled/"),job)?;
    for (rel,_) in disabled{job.check()?;let mut input=fs::open(storage::safe_join(&source_path,&rel)?)?;let mut output=fs::create(storage::safe_join(&stage.path,&rel)?)?;stream(job,&mut input,&mut output)?;}
    let mut content=super::content::load(&source_path)?;content.history.clear();content.snapshots.clear();super::content::save(&stage.path,&content)?;
    let instance=Instance{id:new_id,name:name(new_name)?,minecraft:source.minecraft,loader:source.loader,loader_version:source.loader_version,icon:source.icon,shared_settings:options.settings&&source.shared_settings,overrides:if options.settings{source.overrides}else{Overrides::default()},group:source.group,..Instance::default()};
    b.save_instance(&instance)?;let instance=stage.commit(job)?;stage.cleanup()?;Ok(instance)
}
pub fn export(b:&Backend,id:&str,target:&Path,include_settings:bool,job:&Job)->Result<()> {
    let instance=b.instance(id)?;let source=b.instance_path(id)?;
    let mut dependencies=serde_json::json!({"minecraft":instance.minecraft});
    if instance.loader!="vanilla" {let key=match instance.loader.as_str(){"fabric"=>"fabric-loader","quilt"=>"quilt-loader","forge"=>"forge","neoforge"=>"neoforge",_=>return Err(BackendError::new("loader_unsupported","Unsupported mod loader"))};dependencies[key]=serde_json::json!(instance.loader_version.ok_or_else(||BackendError::new("metadata","Loader version is missing"))?);}
    let manifest=serde_json::json!({"formatVersion":1,"game":"minecraft","versionId":uuid::Uuid::new_v4().to_string(),"name":instance.name,"files":[],"dependencies":dependencies});
    let options=CopyOptions{settings:include_settings,..CopyOptions::default()};let items=files(&source,&|rel|game_file(rel,&options),job)?;
    archive(&source,target,&items,"overrides/",Some(&manifest),job)
}
async fn work<T:Send+'static>(b:B,id:String,kind:&str,app:AppHandle,task_id:Option<String>,operation:impl FnOnce(B,Arc<Job>)->Result<T>+Send+'static)->Result<T>{
    let lease=b.lease(&id)?;let title=b.instance(&id)?.name;let job=Job::tracked(b.clone(),&id,kind,&title,Some(&id),Some(app.clone()),lease.cancel.clone(),task_id)?;let j=job.clone();
    let result=tokio::task::spawn_blocking(move||{let _lease=lease;operation(b,j)}).await.map_err(|_|BackendError::new("collection","The operation could not finish"))?;job.finish(&result);result
}
#[tauri::command]
pub async fn clone_instance(backend:State<'_,B>,app:AppHandle,id:String,name:String,options:CopyOptions,task_id:Option<String>)->Result<Instance>{let source=id.clone();let value=work(backend.inner().clone(),id,"copy",app.clone(),task_id,move|b,j|clone_local(b,&source,&name,options,&j)).await?;allow_screenshots(&app,&value);Ok(value)}
#[tauri::command]
pub async fn export_mrpack(backend:State<'_,B>,app:AppHandle,id:String,include_settings:bool,task_id:Option<String>)->Result<Option<String>>{
    let picker=app.clone();let suggested=backend.instance(&id)?.name.chars().map(|c|if c.is_alphanumeric()||matches!(c,'-'|'_'|' '){c}else{'_'}).collect::<String>();
    let target=tokio::task::spawn_blocking(move||{use tauri_plugin_dialog::DialogExt;picker.dialog().file().set_file_name(format!("{suggested}.mrpack")).add_filter("Modrinth pack",&["mrpack"]).blocking_save_file().map(|p|p.into_path())}).await.map_err(|_|BackendError::new("dialog","Cannot open the save dialog"))?;
    let Some(target)=target else{return Ok(None)};let mut target=target.map_err(|_|BackendError::new("unsafe_path","Invalid export path"))?;target.set_extension("mrpack");let source=id.clone();work(backend.inner().clone(),id,"export",app,task_id,move|b,j|{export(&b,&source,&target,include_settings,&j)?;Ok(Some(target.to_string_lossy().into()))}).await
}

#[derive(Clone,Serialize,Deserialize)] pub struct WorldBackup{pub id:String,pub created:u64,pub bytes:u64,pub automatic:bool}
fn backup_folder(b:&Backend,id:&str)->Result<PathBuf>{storage::validate_instance_id(id)?;Ok(b.root.join("world-backups").join(id))}
pub fn backups(b:&Backend,id:&str)->Result<Vec<WorldBackup>> {
    let folder=backup_folder(b,id)?;if !folder.exists(){return Ok(vec![])};let mut out=vec![];fs::directory(&folder,false)?;
    for entry in std::fs::read_dir(&folder)?{let entry=entry?;let leaf=entry.file_name().to_string_lossy().into_owned();if !leaf.ends_with(".json"){continue;}let value:WorldBackup=serde_json::from_slice(&fs::read(storage::safe_join(&folder,&leaf)?)?)?;uuid::Uuid::parse_str(&value.id).map_err(|_|BackendError::new("metadata","Invalid backup identity"))?;if folder.join(format!("{}.zip",value.id)).is_file(){out.push(value);}}
    out.sort_by_key(|b|std::cmp::Reverse(b.created));Ok(out)
}
pub fn backup(b:&Backend,id:&str,automatic:bool,job:&Job)->Result<Option<WorldBackup>> {
    let source=b.instance_path(id)?;let _world_locks=world_locks(&source)?;let items=files(&source,&|rel|(rel=="saves"||rel.starts_with("saves/"))&&!rel.ends_with("/session.lock"),job)?;if items.is_empty(){return Ok(None)};
    let folder=backup_folder(b,id)?;fs::create_dir_all(&folder)?;let identity=uuid::Uuid::new_v4().to_string();let target=folder.join(format!("{identity}.zip"));archive(&source,&target,&items,"",None,job)?;
    let value=WorldBackup{id:identity,created:now(),bytes:fs::open(&target)?.metadata()?.len(),automatic};
    let settings=b.settings();let max=settings.world_backup_max_mb as u64*1024*1024;
    if value.bytes>max {fs::remove_file(target)?;return Err(BackendError::new("backup_limit","This world backup exceeds the selected storage limit. Increase it in game settings."));}
    if let Err(error)=storage::write_json(&folder.join(format!("{}.json",value.id)),&value){let _=fs::remove_file(target);return Err(error)}
    let mut retained=value.bytes;let mut count=1;for old in backups(b,id)?.into_iter().filter(|old|old.id!=value.id){retained+=old.bytes;count+=1;if count>settings.world_backup_retention||retained>max {fs::remove_file(folder.join(format!("{}.zip",old.id)))?;fs::remove_file(folder.join(format!("{}.json",old.id)))?;}}
    Ok(Some(value))
}
pub async fn before_launch(b:B,id:&str,job:Arc<Job>)->Result<()> {
    let source=id.to_owned();tokio::task::spawn_blocking(move||{if b.settings().world_backups{backup(&b,&source,true,&job)?;}apply_shared(&b,&source)}).await.map_err(|_|BackendError::new("backup","Cannot prepare worlds and shared settings"))?
}
#[tauri::command]pub fn list_world_backups(backend:State<'_,B>,id:String)->Result<Vec<WorldBackup>>{backend.instance(&id)?;backups(&backend,&id)}
#[tauri::command]pub async fn create_world_backup(backend:State<'_,B>,app:AppHandle,id:String,task_id:Option<String>)->Result<Option<WorldBackup>>{let source=id.clone();work(backend.inner().clone(),id,"backup",app,task_id,move|b,j|backup(&b,&source,false,&j)).await}
pub async fn restore(b:B,id:String,backup_id:String,job:Arc<Job>)->Result<Instance>{
    uuid::Uuid::parse_str(&backup_id).map_err(|_|BackendError::new("unsafe_path","Invalid backup identity"))?;let archive_path=backup_folder(&b,&id)?.join(format!("{backup_id}.zip"));
    let retained=b.root.join("temp").join(format!("world-restore-{}",uuid::Uuid::new_v4()));let _retained=storage::Staging(retained.clone());fs::create_dir_all(&retained)?;job.check()?;fs::copy(&archive_path,retained.join("selected.zip"))?;let archive_path=retained.join("selected.zip");
    let check=archive_path.clone();tokio::task::spawn_blocking(move||{let mut zip=zip::ZipArchive::new(fs::open(check)?).map_err(|e|BackendError::new("archive",e.to_string()))?;for i in 0..zip.len(){let entry=zip.by_index(i).map_err(|e|BackendError::new("archive",e.to_string()))?;if !entry.name().starts_with("saves/"){return Err(BackendError::new("unsafe_path","World backup contains unrelated files"));}}Ok::<_,BackendError>(())}).await.map_err(|_|BackendError::new("archive","Cannot read world backup"))??;
    // A complete instance stage also journals the world swap for crash recovery.
    let source=id.clone();let worker=b.clone();let j=job.clone();tokio::task::spawn_blocking(move||backup(&worker,&source,false,&j)).await.map_err(|_|BackendError::new("backup","Cannot save the current worlds"))??;
    let mut stage=super::transaction::InstanceStage::new(b.clone(),&id)?;stage.copy_existing(job.clone()).await?;let path=stage.path.clone();let j=job.clone();
    tokio::task::spawn_blocking(move||{let saves=storage::safe_join(&path,"saves")?;if saves.exists(){fs::remove_dir_all(saves)?;}storage::extract_job(&archive_path,&path,Some(&j))}).await.map_err(|_|BackendError::new("backup","Cannot restore world backup"))??;
    let result=stage.commit(&job)?;stage.cleanup()?;Ok(result)
}
#[tauri::command]pub async fn restore_world_backup(backend:State<'_,B>,app:AppHandle,id:String,backup_id:String,confirmed:bool,task_id:Option<String>)->Result<Instance>{if !confirmed{return Err(BackendError::new("confirmation","Confirm restoration of the worlds"));}let b=backend.inner().clone();let lease=b.lease(&id)?;let job=Job::tracked(b.clone(),&id,"backup",&b.instance(&id)?.name,Some(&id),Some(app),lease.cancel.clone(),task_id)?;let result=restore(b,id,backup_id,job.clone()).await;job.finish(&result);result}

pub fn shared_key(key:&str)->bool{key.starts_with("key_")||key.starts_with("soundCategory_")||matches!(key,"mouseSensitivity"|"invertYMouse"|"fov"|"fovEffectScale"|"screenEffectScale"|"subtitles"|"autoJump"|"toggleCrouch"|"toggleSprint"|"touchscreen"|"discrete_mouse_scroll"|"mouseWheelSensitivity"|"rawMouseInput"|"narrator"|"chatVisibility"|"chatColors"|"chatLinks"|"chatOpacity"|"chatScale")}
fn options(path:&Path)->Result<BTreeMap<String,String>>{let text=fs::read_to_string(path)?;if text.len()>1024*1024{return Err(BackendError::new("metadata","Game settings file is too large"));}Ok(text.lines().filter_map(|line|line.split_once(':')).filter(|(key,_)|shared_key(key)).map(|(k,v)|(k.into(),v.into())).collect())}
pub fn capture_shared(b:&Backend,id:&str)->Result<usize>{let path=b.instance_path(id)?.join("options.txt");if !path.is_file(){return Err(BackendError::new("shared_settings","Launch Minecraft and configure it before selecting it as the settings source"));}let value=options(&path)?;let count=value.len();if count==0{return Err(BackendError::new("shared_settings","Launch Minecraft and configure it before selecting it as the settings source"));}storage::write_json(&b.root.join("shared-options.json"),&value)?;Ok(count)}
pub fn apply_shared(b:&Backend,id:&str)->Result<()> {
    let instance=b.instance(id)?;if !instance.shared_settings||b.settings().shared_settings_source.as_deref()==Some(id){return Ok(())}let source=b.root.join("shared-options.json");if !source.is_file(){return Ok(())}
    let shared:BTreeMap<String,String>=serde_json::from_slice(&fs::read(source)?)?;let path=b.instance_path(id)?.join("options.txt");let original=if path.is_file(){fs::read_to_string(&path)?}else{String::new()};
    let mut lines=original.lines().filter(|line|line.split_once(':').is_none_or(|(key,_)|!shared.contains_key(key)||!shared_key(key))).map(str::to_owned).collect::<Vec<_>>();for (key,value) in shared{if shared_key(&key)&&!value.contains(['\n','\r']){lines.push(format!("{key}:{value}"));}}
    fs::write(path,format!("{}\n",lines.join("\n")))?;Ok(())
}
#[tauri::command]pub fn capture_game_settings(backend:State<'_,B>,id:String)->Result<usize>{let _lease=backend.inner().lease(&id)?;backend.instance(&id)?;let count=capture_shared(&backend,&id)?;backend.store.lock().unwrap().settings.shared_settings_source=Some(id);backend.persist()?;Ok(count)}
#[tauri::command]pub fn set_shared_settings(backend:State<'_,B>,id:String,enabled:bool)->Result<()>{let _lease=backend.inner().lease(&id)?;let mut instance=backend.instance(&id)?;instance.shared_settings=enabled;backend.save_instance(&instance)}
#[tauri::command]pub fn set_instance_group(backend:State<'_,B>,id:String,group:Option<String>)->Result<()>{let _lease=backend.inner().content_lease(&id)?;if group.as_ref().is_some_and(|g|!backend.settings().library_groups.contains(g)){return Err(BackendError::new("collection_group","Choose an existing group"));}let mut instance=backend.instance(&id)?;instance.group=group.map(|name|backend.settings().library_group_ids.get(&name).cloned().unwrap_or(name));backend.save_instance(&instance)}
#[derive(Deserialize)]pub struct Preferences{pub world_backups:bool,pub world_backup_retention:usize,pub world_backup_max_mb:u32,pub close_to_tray:bool,pub minimize_to_tray:bool,pub library_groups:Vec<String>}
#[tauri::command]pub fn save_collection_preferences(backend:State<'_,B>,preferences:Preferences)->Result<()> {
    if !(1..=64).contains(&preferences.world_backup_retention)||!(128..=102400).contains(&preferences.world_backup_max_mb)||preferences.library_groups.len()>64{return Err(BackendError::new("settings","Invalid backup or group settings"));}
    let groups=preferences.library_groups.iter().map(|g|name(g)).collect::<Result<Vec<_>>>()?;let unique=groups.iter().collect::<std::collections::HashSet<_>>();if unique.len()!=groups.len(){return Err(BackendError::new("collection_group","A group with this name already exists"));}
    {let mut store=backend.store.lock().unwrap();let s=&mut store.settings;s.world_backups=preferences.world_backups;s.world_backup_retention=preferences.world_backup_retention;s.world_backup_max_mb=preferences.world_backup_max_mb;s.close_to_tray=preferences.close_to_tray;s.minimize_to_tray=preferences.minimize_to_tray;s.library_group_ids.retain(|name,_|groups.contains(name));for group in &groups{s.library_group_ids.entry(group.clone()).or_insert_with(||uuid::Uuid::new_v4().to_string());}s.library_groups=groups;}backend.persist()
}

#[derive(Clone,Serialize)]pub struct TransferSource{pub token:String,pub name:String,pub minecraft:String,pub loader:String,pub loader_version:Option<String>,pub directory:String,#[serde(skip)]pub path:PathBuf}
fn json(path:&Path)->Option<serde_json::Value>{if fs::open(path).ok()?.metadata().ok()?.len()>2*1024*1024{return None;}fs::read(path).ok().and_then(|v|serde_json::from_slice(&v).ok())}
fn resolve_latest(root:&Path,kind:&str)->Option<String>{let dir=root.join("versions");let mut versions=vec![];for entry in std::fs::read_dir(dir).ok()?.take(512).flatten(){if !entry.file_type().is_ok_and(|t|t.is_dir()){continue;}let Some(id)=entry.file_name().to_str().map(str::to_owned)else{continue;};if !playable_version(&id){continue;}let Some(metadata)=json(&entry.path().join(format!("{id}.json")))else{continue;};if metadata["type"]==kind&&metadata.get("inheritsFrom").is_none(){versions.push((metadata["releaseTime"].as_str().unwrap_or("").to_owned(),id));}}versions.sort();versions.pop().map(|v|v.1)}
fn identify(path:&Path)->Result<Vec<TransferSource>> {
    fs::directory(path,false)?;let fallback=path.file_name().unwrap_or_default().to_string_lossy().into_owned();let mut out=vec![];
    let make=|name:String,minecraft:String,loader:String,loader_version:Option<String>,game:PathBuf|TransferSource{token:uuid::Uuid::new_v4().to_string(),name,minecraft,loader,loader_version,directory:game.to_string_lossy().into(),path:game};
    if let Some(pack)=json(&path.join("mmc-pack.json")){let components=pack["components"].as_array().cloned().unwrap_or_default();if let Some(mc)=components.iter().find(|v|v["uid"]=="net.minecraft").and_then(|v|v["version"].as_str()){
        let mut loader="vanilla";let mut version=None;for (uid,key) in [("net.fabricmc.fabric-loader","fabric"),("org.quiltmc.quilt-loader","quilt"),("net.minecraftforge","forge"),("net.neoforged","neoforge")]{if let Some(v)=components.iter().find(|v|v["uid"]==uid).and_then(|v|v["version"].as_str()){loader=key;version=Some(v.into());}}
        let label=fs::read_to_string(path.join("instance.cfg")).ok().and_then(|s|s.lines().find_map(|l|l.strip_prefix("name=").map(str::to_owned))).unwrap_or(fallback.clone());let game=if path.join(".minecraft").is_dir(){path.join(".minecraft")}else{path.join("minecraft")};if game.is_dir(){out.push(make(label,mc.into(),loader.into(),version,game));}}
    }
    for file in ["profile.json","modrinth.instance.json"]{if let Some(profile)=json(&path.join(file)){let metadata=profile.get("metadata").unwrap_or(&profile);if let Some(mc)=metadata["game_version"].as_str().or_else(||metadata["gameVersion"].as_str()){
        let loader=metadata["loader"].as_str().unwrap_or("vanilla");let version=metadata["loader_version"]["id"].as_str().or_else(||metadata["loader_version"].as_str()).map(|v|v.trim_start_matches(&format!("{mc}-")).into());let label=metadata["name"].as_str().unwrap_or(&fallback);let game=if path.join("minecraft").is_dir(){path.join("minecraft")}else{path.to_owned()};out.push(make(label.into(),mc.into(),loader.into(),version,game));break;}}}
    if out.is_empty(){if let Some(profiles)=json(&path.join("launcher_profiles.json")){if let Some(profiles)=profiles["profiles"].as_object(){for (key,profile) in profiles.iter().take(256){if let Some(version)=profile["lastVersionId"].as_str(){let resolved=if version.starts_with("latest-"){resolve_latest(path,if version=="latest-snapshot"{"snapshot"}else{"release"})}else{Some(version.to_owned())};let Some(version)=resolved.as_deref()else{continue;};if !playable_version(version){continue;}let mut mc=version.to_owned();let mut loader="vanilla";let mut loader_version=None;
        if let Some(metadata)=json(&path.join("versions").join(version).join(format!("{version}.json"))){if let Some(base)=metadata["inheritsFrom"].as_str(){mc=base.into();}let libraries=metadata["libraries"].as_array().cloned().unwrap_or_default();for (prefix,key) in [("net.fabricmc:fabric-loader:","fabric"),("org.quiltmc:quilt-loader:","quilt"),("net.minecraftforge:forge:","forge"),("net.neoforged:neoforge:","neoforge")]{if let Some(v)=libraries.iter().filter_map(|v|v["name"].as_str()).find_map(|v|v.strip_prefix(prefix)){loader=key;loader_version=Some(v.trim_start_matches(&format!("{mc}-")).into());}}}
        // External gameDir fields can point anywhere. Only directories under the
        // selected Minecraft root are accepted; select another root separately.
        let game=profile["gameDir"].as_str().map(PathBuf::from).unwrap_or_else(||path.to_owned());if !game.starts_with(path)||!game.is_dir(){continue;}out.push(make(profile["name"].as_str().unwrap_or(key).into(),mc,loader.into(),loader_version,game));}}}}
    }
    out.retain(|v|playable_version(&v.minecraft)&&matches!(v.loader.as_str(),"vanilla"|"fabric"|"quilt"|"forge"|"neoforge")&&(v.loader=="vanilla"||v.loader_version.as_deref().is_some_and(playable_version)));if out.is_empty()&&(path.join("options.txt").is_file()||path.join("saves").is_dir()||path.join("mods").is_dir()){out.push(make(fallback,String::new(),"vanilla".into(),None,path.to_owned()));}Ok(out)
}
pub fn scan(path:&Path)->Result<Vec<TransferSource>> {
    let mut result=identify(path)?;result.extend(super::launcher_database::scan(path)?);for folder in [path.to_owned(),path.join("instances"),path.join("profiles")]{if !folder.is_dir(){continue;}fs::directory(&folder,false)?;for entry in std::fs::read_dir(folder)?.take(512){let entry=entry?;if entry.file_type()?.is_dir(){if let Ok(found)=identify(&entry.path()){for item in found{if !result.iter().any(|i|i.directory==item.directory&&i.minecraft==item.minecraft&&i.loader==item.loader&&i.loader_version==item.loader_version){result.push(item);}}}}}}
    let known= result.iter().filter(|i|!i.minecraft.is_empty()).map(|i|i.directory.clone()).collect::<std::collections::HashSet<_>>();result.retain(|item|!item.minecraft.is_empty()||!known.contains(&item.directory));
    if result.len()>256{return Err(BackendError::new("collection_import","Too many instances in the selected folder"));}Ok(result)
}
#[tauri::command]pub async fn choose_launcher_folder(backend:State<'_,B>,app:AppHandle)->Result<Option<Vec<TransferSource>>>{let b=backend.inner().clone();tokio::task::spawn_blocking(move||{use tauri_plugin_dialog::DialogExt;let Some(folder)=app.dialog().file().blocking_pick_folder()else{return Ok(None)};let path=folder.into_path().map_err(|_|BackendError::new("unsafe_path","Invalid source folder"))?;let sources=scan(&path)?;let mut registry=b.transfer_sources.lock().unwrap();registry.clear();for item in &sources{registry.insert(item.token.clone(),item.clone());}Ok(Some(sources))}).await.map_err(|_|BackendError::new("collection_import","Cannot scan the selected launcher"))?}
#[tauri::command]pub async fn import_launcher_instance(backend:State<'_,B>,app:AppHandle,token:String,name:String,options:CopyOptions,minecraft:Option<String>,loader:Option<String>,loader_version:Option<String>,task_id:Option<String>)->Result<Instance>{
    let b=backend.inner().clone();let mut source=b.transfer_sources.lock().unwrap().get(&token).cloned().ok_or_else(||BackendError::new("collection_import","Select the source folder again"))?;if source.minecraft.is_empty(){source.minecraft=minecraft.unwrap_or_default();source.loader=loader.unwrap_or_else(||"vanilla".into());source.loader_version=loader_version.filter(|v|!v.is_empty());}if !playable_version(&source.minecraft)||!matches!(source.loader.as_str(),"vanilla"|"fabric"|"quilt"|"forge"|"neoforge")||source.loader!="vanilla"&&!source.loader_version.as_deref().is_some_and(playable_version){return Err(BackendError::new("loader_incompatible","Choose a Minecraft and loader version before importing"));}let lease=b.lease("create-instance")?;let id=uuid::Uuid::new_v4().to_string();let job=Job::tracked(b.clone(),&id,"import",&source.name,Some(&id),Some(app.clone()),lease.cancel.clone(),task_id)?;let j=job.clone();
    let result=tokio::task::spawn_blocking(move||{let _lease=lease;let mut stage=super::transaction::InstanceStage::new(b.clone(),&id)?;fs::create_dir_all(&stage.path)?;copy_files(&source.path,&stage.path,&options,&j)?;b.save_instance(&Instance{id,name:self::name(&name)?,minecraft:source.minecraft,loader:source.loader,loader_version:source.loader_version,..Instance::default()})?;let value=stage.commit(&j)?;stage.cleanup()?;Ok(value)}).await.map_err(|_|BackendError::new("collection_import","Cannot import this instance"))?;if let Ok(value)=&result{allow_screenshots(&app,value);}job.finish(&result);result
}

#[cfg(test)]mod tests{
    use super::*;fn setup()->(B,storage::Staging,Job){let root=std::env::temp_dir().join(format!("canary-collection-{}",uuid::Uuid::new_v4()));let cleanup=storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root).unwrap());let dir=b.instance_path("source").unwrap();fs::create_dir_all(dir.join("saves/World")).unwrap();fs::write(dir.join("saves/World/level.dat"),b"original world").unwrap();fs::write(dir.join("saves/World/session.lock"),b"lock").unwrap();fs::write(dir.join("mods/local.jar"),b"local mod").unwrap();fs::write(dir.join("config/demo.txt"),b"config").unwrap();fs::write(dir.join("screenshots/demo.png"),b"picture").unwrap();fs::write(dir.join("options.txt"),b"version:4000\nfov:0.5\nkey_jump:key.keyboard.space\nrenderDistance:12\n").unwrap();b.save_instance(&Instance{id:"source".into(),name:"Source".into(),minecraft:"1.21.1".into(),loader:"fabric".into(),loader_version:Some("0.16.0".into()),..Instance::default()}).unwrap();let job=Job::new("test",None,Arc::new(std::sync::atomic::AtomicBool::new(false)));(b,cleanup,job)}
    #[test]fn clone_is_independent_and_respects_choices(){let(b,_c,j)=setup();let value=clone_local(b.clone(),"source","Test",CopyOptions{settings:false,..CopyOptions::default()},&j).unwrap();let path=b.instance_path(&value.id).unwrap();assert!(path.join("mods/local.jar").is_file());assert!(!path.join("saves").exists());assert!(!path.join("config").exists());assert!(!path.join("screenshots").exists());assert!(value.version_id.is_none());assert_eq!(value.playtime,0);fs::write(path.join("mods/local.jar"),b"changed").unwrap();assert_eq!(fs::read(b.instance_path("source").unwrap().join("mods/local.jar")).unwrap(),b"local mod");}
    #[test]fn export_is_valid_and_excludes_private_and_world_files(){let(b,_c,j)=setup();let root=b.instance_path("source").unwrap();fs::write(root.join("accounts.json"),b"secret").unwrap();let target=b.root.join("test.mrpack");export(&b,"source",&target,true,&j).unwrap();let preview=super::super::mrpack_import::inspect(&target).unwrap();assert_eq!(preview.minecraft,"1.21.1");let zip=zip::ZipArchive::new(fs::open(target).unwrap()).unwrap();let names=zip.file_names().collect::<Vec<_>>();assert!(names.contains(&"overrides/mods/local.jar"));assert!(!names.iter().any(|s|s.contains("saves")||s.contains("accounts")||s.ends_with("instance.json")));}
    #[test]fn cancellation_leaves_no_copy_or_export(){let(b,_c,j)=setup();j.cancel.store(true,Ordering::Relaxed);assert!(clone_local(b.clone(),"source","Test",CopyOptions::default(),&j).is_err());assert_eq!(b.instances().unwrap().len(),1);let target=b.root.join("cancelled.mrpack");assert!(export(&b,"source",&target,true,&j).is_err());assert!(!target.exists());}
    #[test]fn shared_settings_preserve_local_graphics_and_unknown_keys(){let(b,_c,_j)=setup();capture_shared(&b,"source").unwrap();let mut instance=b.instance("source").unwrap();instance.shared_settings=true;b.save_instance(&instance).unwrap();fs::write(b.instance_path("source").unwrap().join("options.txt"),b"version:5000\nrenderDistance:24\nfov:1\nfov:2\nmodSetting:yes\n").unwrap();apply_shared(&b,"source").unwrap();let text=fs::read_to_string(b.instance_path("source").unwrap().join("options.txt")).unwrap();assert!(text.contains("renderDistance:24"));assert!(text.contains("version:5000"));assert!(text.contains("modSetting:yes"));assert_eq!(text.matches("fov:").count(),1);assert!(text.contains("fov:0.5"));}
    #[tokio::test]async fn restoring_worlds_keeps_mods_and_backs_up_current_world(){let(b,_c,j)=setup();let saved=backup(&b,"source",false,&j).unwrap().unwrap();let path=b.instance_path("source").unwrap();fs::write(path.join("saves/World/level.dat"),b"current world").unwrap();b.store.lock().unwrap().settings.world_backup_retention=1;restore(b.clone(),"source".into(),saved.id,Arc::new(j)).await.unwrap();assert_eq!(fs::read(path.join("saves/World/level.dat")).unwrap(),b"original world");assert_eq!(fs::read(path.join("mods/local.jar")).unwrap(),b"local mod");let copies=backups(&b,"source").unwrap();assert_eq!(copies.len(),1);let mut zip=zip::ZipArchive::new(fs::open(backup_folder(&b,"source").unwrap().join(format!("{}.zip",copies[0].id))).unwrap()).unwrap();let mut bytes=vec![];zip.by_name("saves/World/level.dat").unwrap().read_to_end(&mut bytes).unwrap();assert_eq!(bytes,b"current world");assert!(zip.by_name("saves/World/session.lock").is_err());}
    #[test]fn scan_prism_preserves_version_and_excludes_unrelated_folders(){let(b,_c,_j)=setup();let root=b.root.join("prism/instances/pack");fs::create_dir_all(root.join(".minecraft")).unwrap();storage::write_json(&root.join("mmc-pack.json"),&serde_json::json!({"components":[{"uid":"net.minecraft","version":"1.21.1"},{"uid":"net.fabricmc.fabric-loader","version":"0.16.0"}]})).unwrap();fs::write(root.join("instance.cfg"),b"name=My pack\n").unwrap();let found=scan(&b.root.join("prism")).unwrap();assert_eq!(found.len(),1);assert_eq!(found[0].name,"My pack");assert_eq!(found[0].loader,"fabric");}
}
