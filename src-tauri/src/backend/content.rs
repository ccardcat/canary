//! Instance-owned content inventory and reversible filesystem transactions.
use super::{Backend,model::*,storage,download};
use serde::{Serialize,Deserialize};
use serde_json::{Value,json};
use std::{path::{Path,PathBuf},io::Read};

pub fn default_provider()->String{"modrinth".into()}
#[derive(Clone,Serialize,Deserialize,Debug)]
pub struct Item {#[serde(default)]pub installed:u64,#[serde(default="default_provider")]pub provider:String,pub id:String,pub name:String,pub version:String,pub kind:String,pub path:String,pub enabled:bool,pub source:String,pub hash:String,pub size:u64,pub project:Option<String>,pub provider_version:Option<String>,pub icon:Option<String>,pub loader:Option<String>,#[serde(default)]pub mod_ids:Vec<String>,pub compatibility:String,pub missing:bool,#[serde(default)]pub canary_managed:bool,#[serde(default)]pub update:Option<String>,#[serde(default)]pub dependencies:Vec<String>}
#[derive(Clone,Default,Serialize,Deserialize)]
#[serde(default)]
pub struct State {pub items:Vec<Item>,pub history:Vec<Change>,pub snapshots:Vec<Snapshot>,pub suppressed_pack_paths:Vec<String>}
#[derive(Clone,Serialize,Deserialize)]
pub struct Change {pub timestamp:u64,pub action:String,pub names:Vec<String>,pub ids:Vec<String>}
#[derive(Clone,Serialize,Deserialize)]
pub struct Snapshot {#[serde(default)]pub pack:Option<PackSnapshot>,pub id:String,pub timestamp:u64,pub action:String,pub items:Vec<Item>,pub suppressed_pack_paths:Vec<String>}
#[derive(Clone,Serialize,Deserialize)]
pub struct PackSnapshot {pub version_id:Option<String>,pub version_name:String,pub loader_version:Option<String>,pub metadata:std::collections::HashMap<String,Option<String>>,pub additions:Vec<(String,String)>}
#[derive(Clone,Serialize)]
pub struct Inspection {pub name:String,pub version:String,pub kind:String,pub loader:Option<String>,pub minecraft:Option<String>,pub compatibility:String,pub mod_ids:Vec<String>,pub file:String}
pub fn load(root:&Path)->Result<State>{let p=root.join("content.json");if p.is_file(){Ok(serde_json::from_slice(&std::fs::read(p)?)?)}else{Ok(State::default())}}
pub fn save(root:&Path,state:&State)->Result<()>{storage::write_json(&root.join("content.json"),state)}
pub fn location(item:&Item)->String{if item.enabled{item.path.clone()}else{format!(".canary-content/disabled/{}/{}",item.id,Path::new(&item.path).file_name().unwrap_or_default().to_string_lossy())}}
pub fn folder(kind:&str,world:Option<&str>)->Result<String>{Ok(match kind {"mod"=>"mods".into(),"shader"=>"shaderpacks".into(),"resourcepack"=>"resourcepacks".into(),"datapack"=>{let w=world.ok_or_else(||BackendError::new("world_required","Select an existing world"))?;if w.contains(['/', '\\']){return Err(BackendError::new("unsafe_path","Invalid world name"));}format!("saves/{w}/datapacks")},_=>return Err(BackendError::new("content_type","Unsupported content type"))})}
pub fn worlds(root:&Path)->Result<Vec<Value>>{let dir=storage::safe_join(root,"saves")?;let mut values=vec![];if let Ok(entries)=std::fs::read_dir(&dir){for e in entries.flatten(){if !e.file_type()?.is_dir(){continue;}let name=e.file_name().to_string_lossy().into_owned();let p=storage::safe_join(root,&format!("saves/{name}"))?;if p.join("level.dat").is_file(){values.push(json!({"name":name,"modified":e.metadata()?.modified().ok().and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d|d.as_secs())}));}}}Ok(values)}
fn entry_json(zip:&mut zip::ZipArchive<std::fs::File>,name:&str)->Option<Value>{let entry=zip.by_name(name).ok()?;if entry.size()>1024*1024{return None;}let mut bytes=vec![];entry.take(1024*1024+1).read_to_end(&mut bytes).ok()?;serde_json::from_slice(&bytes).ok()}
pub fn inspect(path:&Path,instance:&Instance)->Result<Inspection>{
    let meta=std::fs::symlink_metadata(path)?;if !meta.is_file()||meta.len()>512*1024*1024{return Err(BackendError::new("content_archive","Select a regular JAR or ZIP smaller than 512 MB"));}
    let extension=path.extension().unwrap_or_default().to_string_lossy().to_ascii_lowercase();if !matches!(extension.as_str(),"jar"|"zip"){return Err(BackendError::new("content_archive","Unsupported file type"));}
    let mut zip=zip::ZipArchive::new(std::fs::File::open(path)?).map_err(|_|BackendError::new("content_archive","Invalid content archive"))?;
    if zip.len()>100_000{return Err(BackendError::new("content_archive","Archive has too many entries"));}
    let names=zip.file_names().map(str::to_owned).collect::<Vec<_>>();
    for name in &names {let rel=name.trim_end_matches('/');if !rel.is_empty(){storage::safe_join(Path::new("validation"),rel)?;}}
    let fabric=entry_json(&mut zip,"fabric.mod.json");let quilt=entry_json(&mut zip,"quilt.mod.json");
    let pack=entry_json(&mut zip,"pack.mcmeta");
    let (kind,loader)=if fabric.is_some(){("mod",Some("fabric".into()))}else if quilt.is_some(){("mod",Some("quilt".into()))}else if names.iter().any(|s|s=="META-INF/neoforge.mods.toml"){("mod",Some("neoforge".into()))}else if names.iter().any(|s|s=="META-INF/mods.toml"||s=="mcmod.info"){("mod",Some("forge".into()))}else if names.iter().any(|s|s.starts_with("shaders/")){("shader",None)}else if pack.is_some()&&names.iter().any(|s|s.starts_with("data/")){("datapack",None)}else if pack.is_some()&&names.iter().any(|s|s.starts_with("assets/")){("resourcepack",None)}else{return Err(BackendError::new("content_archive","No supported mod, shader or pack metadata found"));};
    let metadata=fabric.as_ref().or_else(||quilt.as_ref().map(|q|&q["quilt_loader"]));
    let name=metadata.and_then(|v|v["name"].as_str().or(v["metadata"]["name"].as_str()).or(v["id"].as_str())).map(str::to_owned).unwrap_or_else(||path.file_stem().unwrap_or_default().to_string_lossy().into());
    let version=metadata.and_then(|v|v["version"].as_str()).unwrap_or("").to_owned();
    let mut mod_ids=metadata.and_then(|m|m["id"].as_str()).map(|id|vec![id.to_owned()]).unwrap_or_default();
    if mod_ids.is_empty()&&kind=="mod" {for name in ["META-INF/mods.toml","META-INF/neoforge.mods.toml"]{if let Ok(entry)=zip.by_name(name){if entry.size()<=1024*1024{let mut text=String::new();entry.take(1024*1024).read_to_string(&mut text).ok();let pattern=regex::Regex::new(r#"modId\s*=\s*"([^"]+)""#).unwrap();mod_ids.extend(pattern.captures_iter(&text).map(|c|c[1].to_owned()));}}}}
    let mc=fabric.as_ref().and_then(|v|v["depends"]["minecraft"].as_str()).map(str::to_owned);
    let loader_ok=loader.as_deref().is_none_or(|l|l==instance.loader||(l=="fabric"&&instance.loader=="quilt"));
    let exact_mc=mc.as_ref().filter(|s|s.chars().all(|c|c.is_ascii_digit()||c=='.'));
    let server_only=fabric.as_ref().is_some_and(|v|v["environment"]=="server");
    let compatibility=if !loader_ok||server_only||exact_mc.is_some_and(|v|v!=&instance.minecraft){"incompatible"}else{"possible"};
    Ok(Inspection{name,version,kind:kind.into(),loader,minecraft:mc,compatibility:compatibility.into(),mod_ids,file:path.to_string_lossy().into()})
}
pub fn scan(backend:&Backend,id:&str)->Result<State>{
    let instance=backend.instance(id)?;let root=backend.instance_path(id)?;let mut state=load(&root)?;
    let index:Value=std::fs::read(root.join("modrinth.index.json")).ok().and_then(|v|serde_json::from_slice(&v).ok()).unwrap_or(Value::Null);
    let pack_receipt:Vec<Value>=std::fs::read(root.join("pack-content-files.json")).ok().and_then(|bytes|serde_json::from_slice(&bytes).ok()).unwrap_or_default();
    let managed=index["files"].as_array().map(|f|f.iter().filter_map(|x|x["path"].as_str().map(str::to_owned)).collect::<Vec<_>>()).unwrap_or_default();
    let mut dirs=vec![("mod","mods".into()),("shader","shaderpacks".into()),("resourcepack","resourcepacks".into())];
    for w in worlds(&root)?{dirs.push(("datapack",folder("datapack",w["name"].as_str())?));}
    for (kind,rel) in dirs {let dir=storage::safe_join(&root,&rel)?;if let Ok(entries)=std::fs::read_dir(&dir){for entry in entries.flatten(){if !entry.file_type()?.is_file(){continue;}let path=entry.path();let ext=path.extension().unwrap_or_default().to_string_lossy().to_ascii_lowercase();if !matches!(ext.as_str(),"jar"|"zip"){continue;}
        let relative=format!("{rel}/{}",entry.file_name().to_string_lossy());storage::safe_join(&root,&relative)?;
        let metadata=entry.metadata()?;
        if let Some(item)=state.items.iter_mut().find(|i|i.path==relative&&i.enabled){let actual=download::hash(&path,"sha512")?;if item.hash!=actual{item.hash=actual;item.size=metadata.len();item.project=None;item.provider_version=None;item.source="local".into();item.canary_managed=false;}if item.mod_ids.is_empty(){if let Ok(info)=inspect(&path,&instance){item.mod_ids=info.mod_ids;item.loader=info.loader;}}continue;}
        let info=inspect(&path,&instance).ok();let hash=download::hash(&path,"sha512")?;
        let pack_entry=index["files"].as_array().and_then(|files|files.iter().find(|f|f["path"].as_str()==Some(&relative)&&f["hashes"]["sha512"].as_str().is_some_and(|expected|expected.eq_ignore_ascii_case(&hash))));
        let cf_receipt=if instance.provider=="curseforge"{pack_receipt.iter().find(|entry|entry["path"].as_str()==Some(&relative)&&entry["hash"].as_str()==Some(&hash))}else{None};
        let verified_pack=pack_entry.is_some()||pack_receipt.iter().any(|entry|entry["path"].as_str()==Some(&relative)&&entry["hash"].as_str()==Some(&hash));
        let provenance=pack_entry.and_then(|file|file["downloads"].as_array()).and_then(|urls|urls.iter().filter_map(Value::as_str).find_map(|url|{let u=reqwest::Url::parse(url).ok()?;if u.scheme()!="https"||u.host_str()!=Some("cdn.modrinth.com"){return None;}let parts=u.path_segments()?.collect::<Vec<_>>();if parts.len()>=5&&parts[0]=="data"&&parts[2]=="versions"{Some((parts[1].to_owned(),parts[3].to_owned()))}else{None}}));
        state.items.push(Item{installed:now(),provider:if cf_receipt.is_some(){"curseforge"}else{"modrinth"}.into(),id:uuid::Uuid::new_v4().to_string(),name:info.as_ref().map(|i|i.name.clone()).unwrap_or_else(||entry.file_name().to_string_lossy().into()),version:info.as_ref().map(|i|i.version.clone()).unwrap_or_default(),kind:kind.into(),path:relative.clone(),enabled:true,source:if verified_pack{"pack"}else{"local"}.into(),hash,size:metadata.len(),project:cf_receipt.and_then(|r|r["project"].as_str().map(str::to_owned)).or_else(||provenance.as_ref().map(|p|p.0.clone())),provider_version:cf_receipt.and_then(|r|r["file"].as_str().map(str::to_owned)).or_else(||provenance.map(|p|p.1)),icon:None,loader:info.as_ref().and_then(|i|i.loader.clone()),mod_ids:info.as_ref().map(|i|i.mod_ids.clone()).unwrap_or_default(),compatibility:info.map(|i|i.compatibility).unwrap_or("possible".into()),missing:false,canary_managed:verified_pack,update:None,dependencies:vec![]});
    }}}
    for item in &state.items{if item.source=="local"&&managed.contains(&item.path)&&!state.suppressed_pack_paths.contains(&item.path){state.suppressed_pack_paths.push(item.path.clone());}}
    for item in &mut state.items{let file=storage::safe_join(&root,&location(item))?;item.missing=!file.is_file();if !item.enabled&&!item.missing{let actual=download::hash(&file,"sha512")?;if item.hash!=actual{item.hash=actual;item.size=std::fs::metadata(&file)?.len();item.project=None;item.provider_version=None;item.source="local".into();item.canary_managed=false;if !state.suppressed_pack_paths.contains(&item.path){state.suppressed_pack_paths.push(item.path.clone());}}}}
    save(&root,&state)?;Ok(state)
}
fn blob(root:&Path,item:&Item)->Result<PathBuf>{if item.hash.len()!=128||!item.hash.chars().all(|c|c.is_ascii_hexdigit()){return Err(BackendError::new("checksum","Invalid content hash"));}storage::safe_join(root,&format!(".canary-content/blobs/{}",item.hash))}
pub fn checkpoint(root:&Path,state:&mut State,action:&str)->Result<Snapshot>{
    let snapshot=Snapshot{pack:None,id:uuid::Uuid::new_v4().to_string(),timestamp:now(),action:action.into(),items:state.items.iter().filter(|i|!i.missing).cloned().collect(),suppressed_pack_paths:state.suppressed_pack_paths.clone()};
    // Content-addressed backups reuse identical files between snapshots.
    for item in &snapshot.items{let source=storage::safe_join(root,&location(item))?;if !source.is_file(){continue;}let target=blob(root,item)?;if !target.is_file(){std::fs::create_dir_all(target.parent().unwrap())?;std::fs::copy(source,&target)?;if download::hash(&target,"sha512")?!=item.hash{return Err(BackendError::new("checksum","Content changed while saving snapshot"));}}}
    state.snapshots.push(snapshot.clone());save(root,state)?;Ok(snapshot)
}
pub fn record(backend:&Backend,id:&str,state:&mut State,action:&str,items:&[Item])->Result<()> {
    let change=Change{timestamp:now(),action:action.into(),names:items.iter().map(|i|i.name.clone()).collect(),ids:items.iter().map(|i|i.id.clone()).collect()};state.history.push(change);if state.history.len()>50{state.history.remove(0);}
    {let mut store=backend.store.lock().unwrap();store.activity.push(Activity{id:uuid::Uuid::new_v4().to_string(),timestamp:now(),instance:Some(id.into()),kind:format!("content_{action}"),message:items.iter().map(|i|i.name.as_str()).collect::<Vec<_>>().join(", ")});if store.activity.len()>500{store.activity.remove(0);}}
    backend.persist()
}
pub fn mutate(backend:&Backend,id:&str,ids:&[String],action:&str)->Result<State>{
    let root=backend.instance_path(id)?;let mut state=scan(backend,id)?;let items=state.items.iter().filter(|i|ids.contains(&i.id)).cloned().collect::<Vec<_>>();if items.len()!=ids.len(){return Err(BackendError::new("content_missing","Content selection changed; rescan"));}
    if !matches!(action,"enable"|"disable"|"remove"){return Err(BackendError::new("content_action","Unsupported action"));}
    for item in &items {if item.missing&&action!="remove"{return Err(BackendError::new("content_missing","Content file is missing"));}
      if action!="remove"&&item.enabled!=(action=="enable") {let mut next=item.clone();next.enabled=action=="enable";if storage::safe_join(&root,&location(&next))?.exists(){return Err(BackendError::new("content_conflict","Target already exists"));}}}
    let items=items.into_iter().filter(|i|action=="remove"||i.enabled!=(action=="enable")).collect::<Vec<_>>();if items.is_empty(){return Ok(state);}
    checkpoint(&root,&mut state,action)?;
    let mut moved:Vec<(PathBuf,PathBuf)>=vec![];
    let result:Result<()>= (||{
    for item in &items{let source=storage::safe_join(&root,&location(item))?;if item.missing{if action=="remove"{state.items.retain(|i|i.id!=item.id);continue;}return Err(BackendError::new("content_missing","Content file is missing"));}
        if item.source=="pack"&&!state.suppressed_pack_paths.contains(&item.path){state.suppressed_pack_paths.push(item.path.clone());}
        if action=="remove"{std::fs::remove_file(source)?;state.items.retain(|i|i.id!=item.id);}else{let enabled=action=="enable";if item.enabled!=enabled{let mut next=item.clone();next.enabled=enabled;let target=storage::safe_join(&root,&location(&next))?;if target.exists(){return Err(BackendError::new("content_conflict","Target file already exists"));}std::fs::create_dir_all(target.parent().unwrap())?;std::fs::rename(&source,&target)?;moved.push((source,target));if let Some(i)=state.items.iter_mut().find(|i|i.id==item.id){i.enabled=enabled;}}}
    }
    Ok(())})();
    if let Err(e)=result{for (from,to) in moved.into_iter().rev(){let _=std::fs::rename(to,from);}let _=rollback(backend,id);return Err(e);}
    record(backend,id,&mut state,action,&items)?;retain_backups(backend,&root,&mut state)?;save(&root,&state)?;Ok(state)
}
pub fn rollback(backend:&Backend,id:&str)->Result<State>{
 let root=backend.instance_path(id)?;let old=load(&root)?;let snapshot=old.snapshots.last().cloned().ok_or_else(||BackendError::new("content_snapshot","No content snapshot available"))?;
 let preserved=old.items.iter().filter(|i|!i.canary_managed&&!snapshot.items.iter().any(|s|s.id==i.id)).cloned().collect::<Vec<_>>();
 let staging=storage::Staging(root.join(".canary-content/rollback").join(uuid::Uuid::new_v4().to_string()));std::fs::create_dir_all(&staging.0)?;
 let mut prepared=vec![];
 // Complete and verify every restore copy before changing any installed file.
 for (n,item) in snapshot.items.iter().enumerate(){let target=storage::safe_join(&root,&location(item))?;if target.exists()&&!old.items.iter().any(|x|location(x)==location(item)){return Err(BackendError::new("content_conflict","Rollback destination contains an unknown file"));}
  let source=blob(&root,item)?;if !source.is_file()||download::hash(&source,"sha512")?!=item.hash{return Err(BackendError::new("content_snapshot","Snapshot file is unavailable; current files were not changed"));}
  let temp=staging.0.join(format!("restore-{n}"));std::fs::copy(source,&temp)?;if download::hash(&temp,"sha512")?!=item.hash{return Err(BackendError::new("checksum","Snapshot copy verification failed"));}prepared.push((temp,target));
 }
 for item in &old.items{let p=storage::safe_join(&root,&location(item))?;if p.is_file(){let actual=download::hash(&p,"sha512")?;if !old.items.iter().any(|known|location(known)==location(item)&&known.hash==actual){return Err(BackendError::new("content_conflict","A tracked file changed outside Canary; rescan first"));}}}
 let pack=snapshot.pack.clone();let recovery_pack=pack.as_ref().map(|_|super::pack_update::capture(backend,id,vec![])).transpose()?;
 let mut next=old.clone();next.items=snapshot.items;next.items.extend(preserved.clone());next.suppressed_pack_paths=snapshot.suppressed_pack_paths;next.snapshots.pop();
 let mut held=vec![];let mut restored=vec![];let mut seen=std::collections::HashSet::new();
 let result:Result<()>= (||{
  for item in &old.items{if preserved.iter().any(|p|p.id==item.id){continue;}let loc=location(item);if !seen.insert(loc.clone()){continue;}let source=storage::safe_join(&root,&loc)?;if source.is_file(){let target=staging.0.join(format!("held-{}",held.len()));std::fs::rename(&source,&target)?;held.push((source,target));}}
  if let Some(pack)=&pack{for (rel,expected) in &pack.additions{let source=storage::safe_join(&root,rel)?;if source.is_file()&&download::hash(&source,"sha512")?==*expected{let target=staging.0.join(format!("held-{}",held.len()));std::fs::rename(&source,&target)?;held.push((source,target));}}}
  for (temp,target) in prepared{std::fs::create_dir_all(target.parent().unwrap())?;std::fs::rename(temp,&target)?;restored.push(target);}save(&root,&next)?;if let Some(pack)=&pack{super::pack_update::restore(backend,id,pack)?;}Ok(())
 })();
 if let Err(error)=result{let mut failed=false;for path in restored{if std::fs::remove_file(path).is_err(){failed=true;}}for (source,temp) in held.into_iter().rev(){if std::fs::rename(temp,source).is_err(){failed=true;}}let _=save(&root,&old);if let Some(pack)=&recovery_pack{if super::pack_update::restore(backend,id,pack).is_err(){failed=true;}}if failed{let path=staging.0.to_string_lossy().into_owned();std::mem::forget(staging);return Err(BackendError::new("content_recovery",format!("Recovery files preserved at {path}")));}return Err(error);}
 let items=next.items.clone();record(backend,id,&mut next,"rollback",&items)?;save(&root,&next)?;Ok(next)
}

// Bound backups by the user's retention policy and reclaim unreferenced blobs.
pub fn retain_backups(b:&Backend,root:&Path,state:&mut State)->Result<()> {let settings=b.settings();if !settings.backup_before_changes{state.snapshots.clear();}else{while state.snapshots.len()>settings.backup_retention{state.snapshots.remove(0);}}let hashes:std::collections::HashSet<_>=state.snapshots.iter().flat_map(|s|s.items.iter().map(|i|i.hash.as_str()).chain(s.pack.iter().flat_map(|p|p.metadata.values().filter_map(|h|h.as_deref())))).collect();let folder=root.join(".canary-content/blobs");if let Ok(files)=std::fs::read_dir(&folder){for file in files.flatten(){let name=file.file_name().to_string_lossy().into_owned();if file.file_type()?.is_file()&&name.len()==128&&name.chars().all(|c|c.is_ascii_hexdigit())&&!hashes.contains(name.as_str()){std::fs::remove_file(file.path())?;}}}Ok(())}
