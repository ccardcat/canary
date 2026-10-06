use super::{Backend,download::{self,Artifact,Job},model::*,storage};
use serde_json::{Value,json};
use std::{sync::Arc,path::Path};
pub fn configured()->bool {std::env::var("CANARY_CURSEFORGE_API_KEY").is_ok_and(|s|!s.trim().is_empty())}
fn status_error(status:u16)->BackendError{BackendError::new(match status{401=>"provider_credentials",403=>"provider_unauthorized",429=>"provider_rate_limit",_=>"provider_unavailable"},match status{401=>"CurseForge rejected the API key. Check your official API credential.",403=>"This API key is not authorized for the requested CurseForge resource.",429=>"CurseForge request limit reached. Wait before trying again.",404=>"This CurseForge project or file is no longer available.",_=>"CurseForge is unavailable. Try again later."})}
pub async fn request(backend:&Backend,path:&str,query:&[(&str,String)])->Result<Value> {
    let key=zeroize::Zeroizing::new(std::env::var("CANARY_CURSEFORGE_API_KEY").ok().filter(|s|!s.trim().is_empty()).ok_or_else(||BackendError::new("provider_not_configured","Set CANARY_CURSEFORGE_API_KEY in the Canary process environment using your own official API key"))?);
    let mut url=reqwest::Url::parse("https://api.curseforge.com/v1/").unwrap();url.path_segments_mut().unwrap().pop_if_empty().extend(path.split('/'));url.query_pairs_mut().extend_pairs(query);
    // The key is sent only to the official API, with redirects disabled.
    let mut header=reqwest::header::HeaderValue::from_str(key.trim()).map_err(|_|BackendError::new("provider_credentials","The CurseForge API key has an invalid format"))?;header.set_sensitive(true);
    let response=backend.private_api_client.get(url).header("x-api-key",header).send().await.map_err(|_|BackendError::new("network","Could not reach the official CurseForge API"))?;
    if !response.status().is_success(){let mut error=status_error(response.status().as_u16());error.retryable=matches!(response.status().as_u16(),429|500..=599);return Err(error);}
    Ok(response.json().await?)
}
fn artifact(data:&Value,path:std::path::PathBuf)->Result<Artifact> {
    let url=data["downloadUrl"].as_str().filter(|s|!s.is_empty()).ok_or_else(||BackendError::new("manual_download_required","The author does not allow API downloads for this file; no mirror or guessed CDN URL will be used"))?;
    let hash=data["hashes"].as_array().and_then(|list|list.iter().find(|h|h["algo"]==1)).and_then(|h|h["value"].as_str()).ok_or_else(||BackendError::new("checksum","CurseForge file has no supported publisher SHA-1"))?;
    Ok(Artifact{url:url.into(),path,hash:Some(hash.into()),algorithm:"sha1",size:data["fileLength"].as_u64()})
}
pub async fn search(backend:&Backend,query:String,index:u32)->Result<Value>{request(backend,"mods/search",&[("gameId","432".into()),("classId","4471".into()),("searchFilter",query),("index",index.to_string()),("pageSize","20".into())]).await}
pub async fn project(backend:&Backend,id:u32)->Result<Value>{request(backend,&format!("mods/{id}"),&[]).await}
pub async fn files(backend:&Backend,id:u32)->Result<Value>{request(backend,&format!("mods/{id}/files"),&[]).await}
fn copy_overrides(source:&Path,destination:&Path,job:&Job)->Result<()> {
    fn walk(base:&Path,dir:&Path,dest:&Path,job:&Job)->Result<()>{for e in std::fs::read_dir(dir)?{job.check()?;let e=e?;if e.file_type()?.is_symlink(){return Err(BackendError::new("unsafe_path","Overrides contain a link"));}if e.file_type()?.is_dir(){walk(base,&e.path(),dest,job)?;}else{let path=e.path();let rel=path.strip_prefix(base).unwrap().to_string_lossy().replace('\\',"/");let target=storage::safe_join(dest,&rel)?;if matches!(rel.split('/').next().unwrap_or(""),"instance.json"|"canary-instance.json"|"runtime.json"|"loader.json"|"content.json"|"provider-files.json"|"curseforge-files.json"|"curseforge-manifest.json"|"pack-content-files.json"|".canary-content"|"process.json"|".package"){return Err(BackendError::new("unsafe_path","Reserved Canary metadata"));}std::fs::create_dir_all(target.parent().unwrap())?;{use std::io::{Read,Write};let mut from=std::fs::File::open(path)?;let mut to=std::fs::File::create(target)?;let mut buf=[0u8;128*1024];loop{job.check()?;let n=from.read(&mut buf)?;if n==0{break;}to.write_all(&buf[..n])?;}}}}Ok(())}
    if source.is_dir(){walk(source,source,destination,job)?;}Ok(())
}
pub async fn install(backend:Arc<Backend>,project_id:u32,file_id:u32,job:Arc<Job>)->Result<Instance>{
    let project=download::cancellable(&job,project(&backend,project_id)).await?;let project=&project["data"];job.title(project["name"].as_str().unwrap_or("CurseForge"));
    if project["allowModDistribution"]==false{return Err(BackendError::new("manual_download_required","The author has disabled third-party distribution"));}
    let response=download::cancellable(&job,request(&backend,&format!("mods/{project_id}/files/{file_id}"),&[])).await?;let data=&response["data"];
    if data["modId"].as_u64()!=Some(project_id as u64){return Err(BackendError::new("metadata","CurseForge project/file mismatch"));}
    let archive=backend.root.join("cache").join(format!("curseforge-{project_id}-{file_id}.zip"));download::batch(backend.clone(),vec![artifact(data,archive.clone())?],job.clone(),"modpack").await?;
    let id=format!("curseforge-{project_id}-{file_id}");let target=backend.instance_path(&id)?;if target.exists(){return backend.instance(&id);}
    let stage=target.parent().unwrap().join(format!(".cf-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(stage.clone());let extracted=stage.join(".package");let dst=extracted.clone();let token=job.clone();tokio::task::spawn_blocking(move||storage::extract_job(&archive,&dst,Some(&token))).await.map_err(|e|BackendError::new("archive",e.to_string()))??;
    let manifest:Value=serde_json::from_slice(&std::fs::read(extracted.join("manifest.json"))?)?;
    if manifest["manifestType"]!="minecraftModpack"||manifest["manifestVersion"]!=1{return Err(BackendError::new("modpack","Unsupported CurseForge manifest"));}
    let minecraft=manifest["minecraft"]["version"].as_str().ok_or_else(||BackendError::new("modpack","Minecraft version missing"))?.to_owned();
    let loaders=manifest["minecraft"]["modLoaders"].as_array();let selected=loaders.and_then(|list|list.iter().find(|v|v["primary"]==true).or_else(||list.first()));
    let (loader,loader_version)=if let Some(id)=selected.and_then(|v|v["id"].as_str()){let (kind,version)=id.split_once('-').ok_or_else(||BackendError::new("loader","Invalid CurseForge loader ID"))?;if !matches!(kind,"fabric"|"quilt"|"forge"|"neoforge"){return Err(BackendError::new("loader_unsupported","Unknown CurseForge loader"));}(kind.to_owned(),Some(version.to_owned()))}else{("vanilla".into(),None)};
    let mut plan=vec![];let mut receipts=vec![];for entry in manifest["files"].as_array().ok_or_else(||BackendError::new("modpack","Manifest files missing"))?{job.check()?;if entry["required"]==false{continue;}
        let project=entry["projectID"].as_u64().ok_or_else(||BackendError::new("modpack","File project ID missing"))?;let file=entry["fileID"].as_u64().ok_or_else(||BackendError::new("modpack","File ID missing"))?;
        let detail=download::cancellable(&job,request(&backend,&format!("mods/{project}/files/{file}"),&[])).await?;let file=&detail["data"];let name=file["fileName"].as_str().ok_or_else(||BackendError::new("modpack","File name missing"))?;
        if file["modId"].as_u64()!=Some(project){return Err(BackendError::new("metadata","Manifest project/file mismatch"));}
        let metadata=download::cancellable(&job,request(&backend,&format!("mods/{project}"),&[])).await?;if metadata["data"]["allowModDistribution"]==false{return Err(BackendError::new("manual_download_required","A required project forbids third-party distribution"));}
        let folder=match metadata["data"]["classId"].as_u64(){Some(6)=>"mods",Some(12)=>"resourcepacks",Some(6552)=>"shaderpacks",_=>return Err(BackendError::new("content_type","Manifest references an unsupported content class"))};
        if name.contains(['/', '\\']){return Err(BackendError::new("unsafe_path","Manifest filename contains a directory"));}let rel=format!("{folder}/{name}");let item=artifact(file,storage::safe_join(&stage,&rel)?)?;
        receipts.push(json!({"path":rel,"project":project.to_string(),"file":file["id"].as_u64().unwrap_or(0).to_string(),"url":item.url,"sha1":item.hash,"size":item.size,"name":metadata["data"]["name"],"icon":metadata["data"]["logo"]["url"]}));plan.push(item);
    }
    download::batch(backend.clone(),plan,job.clone(),"mods").await?;
    let overrides=manifest["overrides"].as_str().unwrap_or("overrides");let from=storage::safe_join(&extracted,overrides)?;let to=stage.clone();let token=job.clone();tokio::task::spawn_blocking(move||copy_overrides(&from,&to,&token)).await.map_err(|e|BackendError::new("modpack",e.to_string()))??;
    for folder in ["mods","config","resourcepacks","shaderpacks","saves","screenshots","logs"]{std::fs::create_dir_all(stage.join(folder))?;}
    for receipt in &mut receipts{job.check()?;let path=storage::safe_join(&stage,receipt["path"].as_str().unwrap())?;receipt["hash"]=json!(download::hash_cancellable(&path,"sha512",Some(&job.cancel))?);}
    storage::write_json(&stage.join("curseforge-files.json"),&receipts)?;storage::write_json(&stage.join("pack-content-files.json"),&receipts)?;
    storage::write_json(&stage.join("curseforge-manifest.json"),&manifest)?;
    // This fresh archive staging directory is wholly owned by the installer.
    std::fs::remove_dir_all(&extracted)?;
    let instance=Instance{id,name:project["name"].as_str().unwrap_or("Minecraft").into(),provider:"curseforge".into(),project_id:Some(project_id.to_string()),version_id:Some(file_id.to_string()),version_name:data["displayName"].as_str().unwrap_or("").into(),minecraft,loader,loader_version,directory:target.to_string_lossy().into(),icon:project["logo"]["url"].as_str().map(str::to_owned),..Instance::default()};
    storage::write_json(&stage.join("instance.json"),&instance)?;job.check()?;std::fs::rename(&stage,&target)?;backend.save_instance(&instance)?;super::content::scan(&backend,&instance.id)?;Ok(instance)
}
#[cfg(test)]mod tests {use super::*;use serde_json::json;#[test]fn refuses_restricted_downloads(){assert_eq!(artifact(&json!({"downloadUrl":null}),"file".into()).unwrap_err().code,"manual_download_required");assert_eq!(artifact(&json!({"downloadUrl":"https://example.com/file","hashes":[]}),"file".into()).unwrap_err().code,"checksum");}#[test]fn credential_authorization_and_rate_limit_are_distinct(){assert_eq!(status_error(401).code,"provider_credentials");assert_eq!(status_error(403).code,"provider_unauthorized");assert_eq!(status_error(429).code,"provider_rate_limit");assert_eq!(status_error(503).code,"provider_unavailable");}}

pub async fn verify(b:Arc<Backend>,instance:&Instance,job:Arc<Job>)->Result<()>{let root=b.instance_path(&instance.id)?;let path=root.join("curseforge-files.json");if !path.is_file(){return Err(BackendError::new("modpack","CurseForge file receipt missing; reinstall this pack after backing up worlds"));}let receipts:Vec<Value>=serde_json::from_slice(&std::fs::read(path)?)?;let state=super::content::load(&root)?;let mut files=vec![];for file in receipts {job.check()?;let rel=file["path"].as_str().ok_or_else(||BackendError::new("metadata","Pack file path missing"))?;if state.suppressed_pack_paths.iter().any(|p|p==rel){continue;}let path=storage::safe_join(&root,rel)?;let project=file["project"].as_str().ok_or_else(||BackendError::new("metadata","Pack project missing"))?;let id=file["file"].as_str().ok_or_else(||BackendError::new("metadata","Pack file missing"))?;let hash=file["sha1"].as_str().ok_or_else(||BackendError::new("checksum","Pack checksum missing"))?;let saved=Artifact{url:String::new(),path:path.clone(),hash:Some(hash.into()),algorithm:"sha1",size:file["size"].as_u64()};if download::valid_job(&saved,&job).await?{continue;}let detail=download::cancellable(&job,request(&b,&format!("mods/{project}/files/{id}"),&[])).await?;files.push(artifact(&detail["data"],path)?);}download::batch(b,files,job,"mods").await}
