use super::{Backend,download::{self,Artifact,Job},model::*,storage};
use serde_json::{Value,json};
use std::{sync::Arc,io::Read};
pub async fn verify(backend:Arc<Backend>,instance:&Instance,job:Arc<Job>,deep:bool)->Result<()> {
    if instance.provider=="curseforge"{return super::curseforge::verify(backend,instance,job).await;}
    if !matches!(instance.provider.as_str(),"modrinth"|"mrpack"){return Ok(());}
    let dir=backend.instance_path(&instance.id)?;let receipt=dir.join("provider-files.json");
    if !deep&&receipt.is_file(){let files:Vec<(String,u64)>=serde_json::from_slice(&std::fs::read(&receipt)?)?;
        if files.iter().all(|(p,size)|storage::safe_join(&dir,p).is_ok_and(|p|std::fs::metadata(p).is_ok_and(|m|m.len()==*size))){return Ok(());}}
    job.emit("mods","running",&instance.name);let index=dir.join("modrinth.index.json");
    if !index.is_file(){
        if instance.provider=="mrpack"{return Err(BackendError::new("mrpack_archive","Local pack manifest is missing. Back up your worlds and import the original MRPACK again."));}
        let version=instance.version_id.as_ref().ok_or_else(||BackendError::new("modpack","Pack version ID missing"))?;
        let mut url=reqwest::Url::parse("https://api.modrinth.com/v2/version/").unwrap();url.path_segments_mut().unwrap().pop_if_empty().push(version);
        let metadata=download::cancellable(&job,download::json(&backend,url.as_str())).await?;
        if metadata["project_id"].as_str()!=instance.project_id.as_deref(){return Err(BackendError::new("modpack","Modrinth project/version mismatch"));}
        let files=metadata["files"].as_array().ok_or_else(||BackendError::new("modpack","Modrinth version files missing"))?;
        let mrpack=files.iter().find(|f|f["filename"].as_str().is_some_and(|name|name.ends_with(".mrpack"))).ok_or_else(||BackendError::new("modpack","Version has no .mrpack"))?;
        let hash=mrpack["hashes"]["sha512"].as_str().ok_or_else(||BackendError::new("checksum","Pack SHA-512 is missing"))?;
        let archive=backend.root.join("cache").join(format!("pack-{hash}.mrpack"));
        download::batch(backend.clone(),vec![Artifact{url:mrpack["url"].as_str().ok_or_else(||BackendError::new("modpack","Pack URL missing"))?.into(),path:archive.clone(),hash:Some(hash.into()),algorithm:"sha512",size:mrpack["size"].as_u64()}],job.clone(),"mods").await?;
        let path=index.clone();tokio::task::spawn_blocking(move||->Result<()>{let mut archive=zip::ZipArchive::new(std::fs::File::open(archive)?).map_err(|e|BackendError::new("archive",e.to_string()))?;let entry=archive.by_name("modrinth.index.json").map_err(|e|BackendError::new("modpack",e.to_string()))?;if entry.size()>16*1024*1024{return Err(BackendError::new("modpack","Pack index too large"));}let mut bytes=vec![];entry.take(16*1024*1024+1).read_to_end(&mut bytes)?;let value:Value=serde_json::from_slice(&bytes)?;storage::write_json(&path,&value)}).await.map_err(|e|BackendError::new("modpack",e.to_string()))??;
    }
    let data:Value=serde_json::from_slice(&std::fs::read(index)?)?;
    if data["formatVersion"]!=1||data["game"]!="minecraft"{return Err(BackendError::new("modpack","Invalid Modrinth manifest"));}
    let content=super::content::load(&dir)?;
    let mut files=vec![];let mut paths=vec![];
    for file in data["files"].as_array().ok_or_else(||BackendError::new("modpack","Missing manifest files"))? {job.check()?;
        if file["env"]["client"]=="unsupported"{continue;}
        let rel=file["path"].as_str().ok_or_else(||BackendError::new("modpack","File path missing"))?;let path=storage::safe_join(&dir,rel)?;
        if matches!(rel.split('/').next().unwrap_or(""),"pack-content-files.json"|"content.json"|".canary-content"|"instance.json"|"runtime.json"|"loader.json"|"provider-files.json"|"process.json"|"canary-instance.json"){return Err(BackendError::new("modpack","Manifest cannot manage Canary metadata"));}
        if content.suppressed_pack_paths.iter().any(|p|p==rel){continue;}
        if rel=="saves"||rel.starts_with("saves/")||rel.starts_with("screenshots/"){return Err(BackendError::new("modpack","Pack cannot manage worlds or screenshots"));}
        // Existing mutable configuration belongs to the user; repair does not reset it.
        if path.is_file()&&!(rel.starts_with("mods/")||rel.starts_with("libraries/")){continue;}
        let (algorithm,hash)=if let Some(h)=file["hashes"]["sha512"].as_str(){("sha512",h)}else if let Some(h)=file["hashes"]["sha1"].as_str(){("sha1",h)}else{return Err(BackendError::new("checksum","Manifest file has no supported checksum"));};
        let item=Artifact{url:file["downloads"][0].as_str().ok_or_else(||BackendError::new("modpack","File download URL missing"))?.into(),path:path.clone(),hash:Some(hash.into()),algorithm,size:file["fileSize"].as_u64()};
        if path.is_file()&&!download::valid_job(&item,&job).await?{let backup=storage::safe_join(&dir.join("conflicts").join(now().to_string()),rel)?;std::fs::create_dir_all(backup.parent().unwrap())?;std::fs::copy(&path,backup)?;}
        paths.push(rel.to_owned());files.push(item);
    }
    download::batch(backend.clone(),files,job.clone(),"mods").await?;
    let inventory=paths.into_iter().map(|rel|{let size=std::fs::metadata(storage::safe_join(&dir,&rel)?)?.len();Ok((rel,size))}).collect::<Result<Vec<_>>>()?;
    storage::write_json(&receipt,&inventory)?;job.check()?;Ok(())
}
pub async fn updates(backend:Arc<Backend>)->Result<Value> {
    updates_for_providers(backend,None).await
}
pub async fn updates_for_providers(backend:Arc<Backend>,allowed:Option<&[String]>)->Result<Value> {
    let mut result=vec![];for mut instance in backend.instances()?{
        let Ok(_lease)=backend.lease(&instance.id) else{continue};
        if instance.status=="unavailable"||allowed.is_some_and(|providers|!providers.contains(&instance.provider)){continue;}if instance.provider=="curseforge"{if let Some(project)=&instance.project_id{let latest=match super::curseforge_content::versions(&backend,project,"modpack",&instance.minecraft,&instance.loader,false).await{Ok(versions)=>versions.into_iter().next(),Err(error)=>{result.push(json!({"id":instance.id,"error":error}));continue;}};instance.update_available=latest.as_ref().and_then(|v|v["id"].as_str()).is_some_and(|id|Some(id)!=instance.version_id.as_deref());backend.save_instance(&instance)?;result.push(json!({"id":instance.id,"available":instance.update_available,"latest":latest}));}continue;}if instance.provider!="modrinth"{continue;}
        let Some(project)=&instance.project_id else{continue};let mut url=reqwest::Url::parse("https://api.modrinth.com/v2/project/").unwrap();url.path_segments_mut().unwrap().pop_if_empty().push(project).push("version");
        url.query_pairs_mut().append_pair("game_versions",&json!([instance.minecraft]).to_string()).append_pair("loaders",&json!([instance.loader]).to_string());
        let versions=match download::json(&backend,url.as_str()).await{Ok(versions)=>versions,Err(error)=>{result.push(json!({"id":instance.id,"error":error}));continue;}};let latest=versions.as_array().and_then(|v|v.first());
        instance.update_available=latest.and_then(|v|v["id"].as_str()).is_some_and(|id|Some(id)!=instance.version_id.as_deref());backend.save_instance(&instance)?;result.push(json!({"id":instance.id,"available":instance.update_available,"latest":latest}));
    }Ok(json!(result))
}
