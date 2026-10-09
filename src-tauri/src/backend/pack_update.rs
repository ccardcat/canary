//! Safe updates reuse the existing mrpack installer inside an isolated staging root.
//! User additions, worlds and existing configuration are never silently replaced.
use super::{Backend, content::{self, PackSnapshot, State}, content_provider,
    download::{self, Job}, model::*, storage};
use serde::Serialize;
use serde_json::{Value, json};
use std::{collections::HashMap, path::{Path, PathBuf}, sync::{Arc, atomic::Ordering}};

const METADATA: &[&str] = &["modrinth.index.json", "canary-instance.json", "provider-files.json", "runtime.json", "loader.json", "pack-content-files.json","curseforge-manifest.json","curseforge-files.json"];
#[derive(Serialize)]
pub struct Preview {pub version:String,pub name:String,pub user_files:usize,pub fingerprint:String}
pub fn capture(b:&Backend,id:&str,additions:Vec<(String,String)>)->Result<PackSnapshot>{
    let i=b.instance(id)?;let root=b.instance_path(id)?;let mut metadata=HashMap::new();
    for name in METADATA {let path=storage::safe_join(&root,name)?;metadata.insert((*name).into(),if path.is_file(){let hash=download::hash(&path,"sha512")?;let backup=storage::safe_join(&root,&format!(".canary-content/blobs/{hash}"))?;crate::backend::protected_fs::create_dir_all(backup.parent().unwrap())?;if !backup.exists(){crate::backend::protected_fs::copy(&path,&backup)?;}if download::hash(&backup,"sha512")?!=hash{return Err(BackendError::new("checksum","Pack metadata backup verification failed"));}Some(hash)}else{None});}
    Ok(PackSnapshot{version_id:i.version_id,version_name:i.version_name,loader_version:i.loader_version,metadata,additions})
}
pub fn restore(b:&Backend,id:&str,pack:&PackSnapshot)->Result<()>{
    let root=b.instance_path(id)?;
    for (name,value) in &pack.metadata {if !METADATA.contains(&name.as_str()){return Err(BackendError::new("unsafe_path","Unsupported pack metadata"));}let path=storage::safe_join(&root,name)?;if let Some(hash)=value{if hash.len()!=128||!hash.chars().all(|c|c.is_ascii_hexdigit()){return Err(BackendError::new("checksum","Invalid metadata snapshot hash"));}let backup=storage::safe_join(&root,&format!(".canary-content/blobs/{hash}"))?;if download::hash(&backup,"sha512")?!=*hash{return Err(BackendError::new("checksum","Pack metadata snapshot verification failed"));}let value:Value=serde_json::from_slice(&crate::backend::protected_fs::read(backup)?)?;storage::write_json(&path,&value)?;}else if path.is_file(){crate::backend::protected_fs::remove_file(path)?;}}
    let mut i=b.instance(id)?;i.version_id=pack.version_id.clone();i.version_name=pack.version_name.clone();i.loader_version=pack.loader_version.clone();i.status="installed".into();i.update_available=true;b.save_instance(&i)
}
pub async fn preview(b:&Backend,id:&str,beta:bool)->Result<Preview>{
    let i=b.instance(id)?;if !matches!(i.provider.as_str(),"modrinth"|"curseforge"){return Err(BackendError::new("modpack","This instance is not a provider-managed modpack"));}
    let project=i.project_id.as_deref().ok_or_else(||BackendError::new("modpack","Pack project missing"))?;
    let versions=if i.provider=="curseforge"{json!(super::curseforge_content::versions(b,project,"modpack",&i.minecraft,&i.loader,beta).await?)}else{let mut url=reqwest::Url::parse("https://api.modrinth.com/v2/project/").unwrap();url.path_segments_mut().unwrap().pop_if_empty().extend([project,"version"]);url.query_pairs_mut().append_pair("game_versions",&json!([i.minecraft]).to_string()).append_pair("loaders",&json!([i.loader]).to_string());download::json(b,url.as_str()).await?};
    let versions=versions.as_array().ok_or_else(||BackendError::new("metadata","Pack versions missing"))?;
    let latest=versions.iter().filter(|v|beta||v["version_type"]=="release").max_by_key(|v|v["date_published"].as_str());
    let latest=latest.ok_or_else(||BackendError::new("pack_no_update","No compatible pack release"))?;
    let version=latest["id"].as_str().ok_or_else(||BackendError::new("metadata","Pack version ID missing"))?;
    if Some(version)==i.version_id.as_deref(){return Err(BackendError::new("pack_no_update","The compatible pack version is already installed"));}
    if let Some(current)=versions.iter().find(|v|v["id"].as_str()==i.version_id.as_deref()) {if latest["date_published"].as_str()<=current["date_published"].as_str(){return Err(BackendError::new("pack_no_update","No newer compatible pack release"));}}
    let state=content::scan(b,id)?;use sha2::Digest;
    let fingerprint=crate::backend::download::hex(sha2::Sha256::digest(serde_json::to_vec(&json!({"version":version,"current":i.version_id,"minecraft":i.minecraft,"loader":i.loader,"items":state.items}))?));
    Ok(Preview{version:version.into(),name:latest["version_number"].as_str().unwrap_or(version).into(),user_files:state.items.iter().filter(|x|x.source!="pack").count(),fingerprint})
}
fn walk(root:&Path,dir:&Path,files:&mut Vec<(String,PathBuf)>)->Result<()>{
    for entry in std::fs::read_dir(dir)?{let entry=entry?;let path=entry.path();let relative=path.strip_prefix(root).map_err(|_|BackendError::new("unsafe_path","Pack file outside staging"))?.to_string_lossy().replace('\\',"/");storage::safe_join(root,&relative)?;
        if entry.file_type()?.is_dir(){walk(root,&path,files)?;}else if entry.file_type()?.is_file(){files.push((relative,path));}else{return Err(BackendError::new("unsafe_path","Pack contains a non-regular file"));}}
    Ok(())
}
// This merge can also be tested without a network or a game runtime.
pub fn apply_staged(b:&Backend,id:&str,prepared:&Path,version:&str)->Result<State>{
    let mut instance=b.instance(id)?;let root=b.instance_path(id)?;let state=content::scan(b,id)?;
    let legacy:Value=if instance.provider=="curseforge"{let source:Instance=serde_json::from_slice(&crate::backend::protected_fs::read(prepared.join("instance.json"))?)?;if source.provider!="curseforge"||source.loader!=instance.loader{return Err(BackendError::new("content_incompatible","Pack update changes provider or loader"));}let mut dependencies=json!({"minecraft":source.minecraft});let key=match source.loader.as_str(){"fabric"=>"fabric-loader","quilt"=>"quilt-loader",other=>other};if source.loader!="vanilla"{dependencies[key]=json!(source.loader_version);}json!({"project_id":source.project_id,"version_id":source.version_id,"pack_version":source.version_name,"dependencies":dependencies})}else{serde_json::from_slice(&crate::backend::protected_fs::read(prepared.join("canary-instance.json"))?)?};
    if legacy["project_id"].as_str()!=instance.project_id.as_deref()||legacy["version_id"]!=version||legacy["dependencies"]["minecraft"]!=instance.minecraft{return Err(BackendError::new("content_incompatible","Pack update must retain the Minecraft version and provider project"));}
    let deps=&legacy["dependencies"];let key=match instance.loader.as_str(){"fabric"=>"fabric-loader","quilt"=>"quilt-loader","forge"=>"forge","neoforge"=>"neoforge","vanilla"=>"minecraft",_=>return Err(BackendError::new("content_incompatible","Unsupported pack loader"))};
    if deps[key].as_str().is_none(){return Err(BackendError::new("content_incompatible","Pack update changes the loader"));}
    let new_loader=if instance.loader=="vanilla"{None}else{deps[key].as_str().map(str::to_owned)};
    let staging=storage::Staging(root.join(".canary-content/pack-update").join(uuid::Uuid::new_v4().to_string()));crate::backend::protected_fs::create_dir_all(&staging.0)?;
    // Read the prepared pack using the ordinary inventory scanner in a disposable backend.
    let isolated=Backend::with_root(staging.0.join("inventory"))?;let incoming_dir=isolated.instance_path("incoming")?;crate::backend::protected_fs::create_dir_all(&incoming_dir)?;
    let mut incoming=instance.clone();incoming.id="incoming".into();incoming.directory=incoming_dir.to_string_lossy().into();isolated.save_instance(&incoming)?;
    let mut all=vec![];walk(prepared,prepared,&mut all)?;let mut auxiliary=vec![];
    for (rel,path) in &all {if instance.provider=="curseforge"&&matches!(rel.as_str(),"instance.json"|"content.json"){continue;}if matches!(rel.split('/').next().unwrap_or(""),"saves"|"screenshots"|"logs"|".canary-content"|"content.json"|"instance.json"|"runtime.json"|"loader.json"|"provider-files.json"){return Err(BackendError::new("content_conflict","Pack update cannot manage user worlds or Canary runtime files"));}
        if METADATA.contains(&rel.as_str()){continue;}
        if ["mods/","shaderpacks/","resourcepacks/"].iter().any(|prefix|rel.starts_with(prefix))&&path.extension().is_some_and(|e|e=="jar"||e=="zip") {let target=storage::safe_join(&incoming_dir,rel)?;crate::backend::protected_fs::create_dir_all(target.parent().unwrap())?;crate::backend::protected_fs::copy(path,target)?;}
        else {let target=storage::safe_join(&root,rel)?;if !target.exists(){auxiliary.push((rel.clone(),path.clone(),download::hash(path,"sha512")?));}}
    }
    if instance.provider=="curseforge"{crate::backend::protected_fs::copy(prepared.join("pack-content-files.json"),incoming_dir.join("pack-content-files.json"))?;}else{crate::backend::protected_fs::copy(prepared.join("modrinth.index.json"),incoming_dir.join("modrinth.index.json"))?;}
    let incoming=content::scan(&isolated,"incoming")?;let mut files=vec![];let mut retain=vec![];
    for mut item in incoming.items {item.source="pack".into();item.canary_managed=true;item.enabled=true;
        let existing=state.items.iter().find(|x|x.path==item.path||item.project.is_some()&&x.provider==item.provider&&x.project==item.project);
        if let Some(old)=existing {if old.source!="pack"{if old.hash!=item.hash{return Err(BackendError::new("content_conflict",format!("User content conflicts with updated pack: {}",old.name)));}retain.push(old.id.clone());continue;}item.enabled=old.enabled;}
        let source=storage::safe_join(&incoming_dir,&item.path)?;files.push((item,source));
    }
    let retired=state.items.iter().filter(|x|x.source=="pack"&&!retain.contains(&x.id)).map(|x|x.id.clone()).collect::<Vec<_>>();
    let snapshot=capture(b,id,auxiliary.iter().map(|(rel,_,hash)|(rel.clone(),hash.clone())).collect())?;
    let mut next=content_provider::apply_transaction(b,id,state,files,&retired,Some(snapshot))?;
    let result:Result<()>= (||{for (rel,source,_) in auxiliary{let target=storage::safe_join(&root,&rel)?;if target.exists(){return Err(BackendError::new("content_conflict","An override file was added outside Canary during update"));}crate::backend::protected_fs::create_dir_all(target.parent().unwrap())?;let temporary=staging.0.join(format!("override-{}",uuid::Uuid::new_v4()));crate::backend::protected_fs::copy(&source,&temporary)?;if download::hash(&temporary,"sha512")?!=download::hash(&source,"sha512")?{return Err(BackendError::new("checksum","Pack override copy changed during update"));}crate::backend::protected_fs::rename(temporary,target)?;}
        for name in if instance.provider=="curseforge"{vec!["curseforge-files.json","curseforge-manifest.json"]}else{vec!["modrinth.index.json","canary-instance.json"]}{let mut data:Value=serde_json::from_slice(&crate::backend::protected_fs::read(prepared.join(name))?)?;if name=="canary-instance.json"{data["instance_path"]=json!(root);data["name"]=json!(instance.name);}storage::write_json(&root.join(name),&data)?;}
        let receipt=next.items.iter().filter(|x|x.source=="pack").map(|x|json!({"path":x.path,"hash":x.hash,"project":x.project,"file":x.provider_version})).collect::<Vec<_>>();storage::write_json(&root.join("pack-content-files.json"),&receipt)?;
        for name in ["runtime.json","loader.json","provider-files.json"]{let path=root.join(name);if path.is_file(){crate::backend::protected_fs::remove_file(path)?;}}
        instance.version_id=Some(version.into());instance.version_name=legacy["pack_version"].as_str().unwrap_or(version).into();instance.loader_version=new_loader;instance.update_available=false;instance.status="installed".into();instance.error=None;b.save_instance(&instance)?;Ok(())})();
    if let Err(error)=result{content::rollback(b,id)?;return Err(error);}
    content::record(b,id,&mut next,"pack_update",&[])?;content::retain_backups(b,&root,&mut next)?;content::save(&root,&next)?;Ok(next)
}
pub async fn install(b:Arc<Backend>,id:&str,beta:bool,fingerprint:&str,job:Arc<Job>)->Result<State>{
    let plan=download::cancellable(&job,preview(&b,id,beta)).await?;if plan.fingerprint!=fingerprint{return Err(BackendError::new("content_plan_changed","Review the changed pack update plan"));}
    let instance=b.instance(id)?;let stage=storage::Staging(b.root.join("temp").join(format!("pack-update-{}",uuid::Uuid::new_v4())));crate::backend::protected_fs::create_dir_all(&stage.0)?;
    let prepared=if instance.provider=="curseforge"{let isolated=Arc::new(Backend::with_root(stage.0.join("curseforge-stage"))?);let project=instance.project_id.as_deref().unwrap().parse().map_err(|_|BackendError::new("modpack","Invalid CurseForge project ID"))?;let file=plan.version.parse().map_err(|_|BackendError::new("modpack","Invalid CurseForge file ID"))?;PathBuf::from(super::curseforge::install(isolated,project,file,job.clone()).await?.directory)}else{let install_root=stage.0.join("Canary/instances");let install=crate::installer::install_at_job(instance.project_id.as_deref().unwrap(),&plan.version,&instance.name,&install_root,Some(job.as_ref()),|p|{job.files.store(p.total,Ordering::Relaxed);job.completed.store(p.completed,Ordering::Relaxed);job.total.store(p.bytes_total,Ordering::Relaxed);job.downloaded.store(p.downloaded,Ordering::Relaxed);job.network.store(p.downloaded,Ordering::Relaxed);job.emit("content_pack","running",&p.file);});install.await.map_err(|e|BackendError::new(if e.stage=="cancelled"{"cancelled"}else{"modpack"},e.to_string()))?};
    job.critical()?;job.emit("content_apply","running",&instance.name);
    let result=apply_staged(&b,id,&prepared,&plan.version)?;job.emit("content_pack","success",&instance.name);Ok(result)
}
