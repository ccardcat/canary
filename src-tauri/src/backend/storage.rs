use super::model::*;
use std::{fs, io::Write, path::{Path, PathBuf, Component}};
// Only fresh staging directories are owned by this guard. Existing instances
// and downloaded cache artifacts are never cleanup targets.
pub struct Staging(pub PathBuf);
impl Drop for Staging {fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
pub fn write_json(path:&Path, value:&impl serde::Serialize)->Result<()> {
    let temp=path.with_extension("json.tmp"); let mut file=fs::File::create(&temp)?;
    file.write_all(&serde_json::to_vec_pretty(value)?)?; file.sync_all()?; drop(file); fs::rename(temp,path)?; Ok(())
}
pub fn load(root:&Path)->Result<Store> {
    let path=root.join("settings.json"); let mut store:Store=if path.is_file(){serde_json::from_slice(&fs::read(path)?)?}else{Store::default()};
    store.schema=1; Ok(store)
}
pub fn safe_join(base:&Path, rel:&str)->Result<PathBuf> {
    if rel.is_empty()||rel.contains(['\\',':'])||Path::new(rel).components().any(|c|!matches!(c,Component::Normal(_))) {return Err(BackendError::new("unsafe_path","Unsafe relative path"));}
    let mut path=base.to_owned();
    for part in rel.split('/') {
        let stem=part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if part.ends_with(['.',' '])||part.contains(['<','>','"','|','?','*'])||matches!(stem.as_str(),"CON"|"PRN"|"AUX"|"NUL")||((stem.starts_with("COM")||stem.starts_with("LPT"))&&stem.len()==4&&matches!(stem.as_bytes()[3],b'1'..=b'9')) {return Err(BackendError::new("unsafe_path","Reserved Windows path"));}
        path.push(part); if fs::symlink_metadata(&path).is_ok_and(|m|m.file_type().is_symlink()) {return Err(BackendError::new("unsafe_path","Symbolic links are not allowed in managed paths"));}
    }
    Ok(path)
}
pub fn instance_dir(root:&Path,id:&str)->Result<PathBuf> {
    if id.is_empty()||!id.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'||c=='_'){return Err(BackendError::new("unsafe_path","Invalid instance ID"));}
    safe_join(&root.join("instances"),id)
}
pub fn instance(root:&Path,id:&str)->Result<Instance> {
    let dir=instance_dir(root,id)?; let path=dir.join("instance.json");
    let mut value:Instance=if path.is_file(){serde_json::from_slice(&fs::read(path)?)?}else{
        let legacy:serde_json::Value=serde_json::from_slice(&fs::read(dir.join("canary-instance.json"))?)?;
        let deps=&legacy["dependencies"]; let (loader,version)=["fabric-loader","quilt-loader","forge","neoforge"].iter().find_map(|key|deps[key].as_str().map(|version|(*key,Some(version.to_owned())))).unwrap_or(("vanilla",None));
        Instance {id:id.into(),name:legacy["name"].as_str().unwrap_or(id).into(),provider:"modrinth".into(),project_id:legacy["project_id"].as_str().map(str::to_owned),version_id:legacy["version_id"].as_str().map(str::to_owned),version_name:legacy["pack_version"].as_str().unwrap_or("").into(),minecraft:deps["minecraft"].as_str().unwrap_or("").into(),loader:loader.trim_end_matches("-loader").into(),loader_version:version,installed:fs::metadata(dir.join("canary-instance.json"))?.modified()?.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),..Instance::default()}
    };
    if value.id!=id{return Err(BackendError::new("metadata","Instance ID does not match its directory"));}
    value.directory=dir.to_string_lossy().into(); Ok(value)
}
pub fn instances(root:&Path)->Result<Vec<Instance>> {
    let mut out=vec![];
    for entry in fs::read_dir(root.join("instances"))? {
        let entry=entry?; let id=entry.file_name().to_string_lossy().into_owned();
        if id.starts_with('.')||!entry.file_type()?.is_dir(){continue;}
        match instance(root,&id) {Ok(mut value)=>{if matches!(value.status.as_str(),"preparing"|"running"|"stopping"|"downloading"){value.status="installed".into();}out.push(value)},Err(e)=>eprintln!("[instance][{}] {}",id,e.code)}
    }
    out.sort_by_key(|i|std::cmp::Reverse(i.installed)); Ok(out)
}
pub fn extract(archive:&Path,base:&Path)->Result<()> {
    let mut zip=zip::ZipArchive::new(fs::File::open(archive)?).map_err(|e|BackendError::new("archive",e.to_string()))?;
    fs::create_dir_all(base)?;
    for i in 0..zip.len(){let mut entry=zip.by_index(i).map_err(|e|BackendError::new("archive",e.to_string()))?;
        let rel=entry.name().trim_end_matches('/'); if rel.is_empty()||rel.starts_with("META-INF/"){continue;}
        if entry.unix_mode().is_some_and(|m|m&0o170000==0o120000){return Err(BackendError::new("archive","Archive contains symbolic links"));}
        let output=safe_join(base,rel)?;
        if entry.is_dir(){fs::create_dir_all(output)?;}else{fs::create_dir_all(output.parent().unwrap())?;let mut file=fs::File::create(output)?;std::io::copy(&mut entry,&mut file)?;}
    }Ok(())
}
#[cfg(test)] mod tests {use super::*;#[test]fn traversal(){for value in ["../x","C:/x","/x","a\\b","a/../b","CON.txt","a/NUL","x:stream","a/COM1.jar"]{assert!(safe_join(Path::new("safe"),value).is_err(),"{value}");}assert!(safe_join(Path::new("safe"),"mods/a.jar").is_ok());}
#[test]fn legacy_migration_preserves_identity_and_worlds(){let root=std::env::temp_dir().join(format!("canary-migration-{}",uuid::Uuid::new_v4()));let _cleanup=Staging(root.clone());let dir=instance_dir(&root,"project-version").unwrap();fs::create_dir_all(dir.join("saves/World")).unwrap();fs::write(dir.join("saves/World/level.dat"),b"world").unwrap();write_json(&dir.join("canary-instance.json"),&serde_json::json!({"name":"Existing pack","project_id":"project","version_id":"version","instance_path":"C:/untrusted/path","pack_version":"1.2","dependencies":{"minecraft":"1.21.1","fabric-loader":"0.16.0"}})).unwrap();let migrated=instance(&root,"project-version").unwrap();assert_eq!(migrated.loader,"fabric");assert_eq!(migrated.loader_version.as_deref(),Some("0.16.0"));assert_eq!(migrated.directory,dir.to_string_lossy());assert_eq!(migrated.version_id.as_deref(),Some("version"));write_json(&dir.join("instance.json"),&migrated).unwrap();assert_eq!(instance(&root,"project-version").unwrap().id,migrated.id);assert_eq!(fs::read(dir.join("saves/World/level.dat")).unwrap(),b"world");}
}
