use super::model::*;
use std::{fs, io::Write, path::{Path, PathBuf, Component}};
// Only fresh staging directories are owned by this guard. Existing instances
// and downloaded cache artifacts are never cleanup targets.
pub struct Staging(pub PathBuf);
impl Drop for Staging {fn drop(&mut self){let _=crate::backend::protected_fs::remove_dir_all(&self.0);}}
pub fn write_json(path:&Path, value:&impl serde::Serialize)->Result<()> {
    crate::backend::protected_fs::write(path,serde_json::to_vec_pretty(value)?)?; Ok(())
}
pub fn load(root:&Path)->Result<Store> {
    let path=root.join("settings.json"); let mut store:Store=if path.is_file(){serde_json::from_slice(&crate::backend::protected_fs::read(path)?)?}else{Store::default()};
    store.activity.retain(|a|a.kind!="ready"&&a.timestamp>=now().saturating_sub(30*86400));let excess=store.activity.len().saturating_sub(300);store.activity.drain(..excess);store.schema=1; Ok(store)
}
pub fn safe_join(base:&Path, rel:&str)->Result<PathBuf> {
    if rel.is_empty()||rel.contains(['\\',':'])||Path::new(rel).components().any(|c|!matches!(c,Component::Normal(_))) {return Err(BackendError::new("unsafe_path","Unsafe relative path"));}
    for ancestor in base.ancestors(){if fs::symlink_metadata(ancestor).is_ok_and(|m|m.file_type().is_symlink()){return Err(BackendError::new("unsafe_path","Managed path contains a symbolic link"));}}
    let mut path=base.to_owned();
    for part in rel.split('/') {
        let stem=part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if part.is_empty()||part.chars().any(|c|c.is_control())||part.ends_with(['.',' '])||part.contains(['<','>','"','|','?','*'])||part.encode_utf16().count()>255||matches!(stem.as_str(),"CON"|"PRN"|"AUX"|"NUL"|"CONIN$"|"CONOUT$")||["COM","LPT"].iter().any(|p|stem.strip_prefix(p).is_some_and(|n|matches!(n,"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"¹"|"²"|"³"))) {return Err(BackendError::new("unsafe_path","Reserved Windows path"));}
        path.push(part); if fs::symlink_metadata(&path).is_ok_and(|m|m.file_type().is_symlink()) {return Err(BackendError::new("unsafe_path","Symbolic links are not allowed in managed paths"));}
    }
    Ok(path)
}
pub fn instance_dir(root:&Path,id:&str)->Result<PathBuf> {
    validate_instance_id(id)?;
    safe_join(&root.join("instances"),id)
}
/// Shared pack policy checks Windows aliases on every platform.
pub fn pack_path(base:&Path,relative:&str)->Result<PathBuf>{
    let first=relative.trim_end_matches('/').split('/').next().unwrap_or("").to_ascii_lowercase();
    if matches!(first.as_str(),"saves"|"screenshots"|"logs"|"instance.json"|"canary-instance.json"|"runtime.json"|"loader.json"|"provider-files.json"|"curseforge-files.json"|"curseforge-manifest.json"|"pack-content-files.json"|"content.json"|".canary-content"|"process.json"|".package"|"modrinth.index.json"|"mrpack-source.json"|"input.mrpack"){
        return Err(BackendError::new("unsafe_path","Pack files cannot replace Canary metadata, worlds or screenshots"));
    }
    safe_join(base,relative.trim_end_matches('/'))
}
pub fn validate_instance_id(id:&str)->Result<()> {
    if id.is_empty()||id.len()>192||id.contains(['/', '\\'])||!id.chars().all(|c|c.is_ascii_alphanumeric()||matches!(c,'-'|'_'|'.')){return Err(BackendError::new("unsafe_path","Invalid instance ID"));}
    safe_join(Path::new("instance-id-validation"),id).map(|_|())
}
#[derive(Clone,Copy)] pub struct ExtractionLimits{pub entries:usize,pub entry_bytes:u64,pub total_bytes:u64}
impl Default for ExtractionLimits{fn default()->Self{Self{entries:200_000,entry_bytes:4*1024*1024*1024,total_bytes:32*1024*1024*1024}}}
pub struct ExtractionBudget{limits:ExtractionLimits,entries:usize,total:u64}
impl ExtractionBudget{
    pub fn new(limits:ExtractionLimits)->Self{Self{limits,entries:0,total:0}}
    pub fn entry(&mut self,bytes:u64)->Result<()>{
        self.entries=self.entries.checked_add(1).ok_or_else(||BackendError::new("archive_limit","Archive entry count overflow"))?;
        self.total=self.total.checked_add(bytes).ok_or_else(||BackendError::new("archive_limit","Archive size overflow"))?;
        if self.entries>self.limits.entries||bytes>self.limits.entry_bytes||self.total>self.limits.total_bytes{return Err(BackendError::new("archive_limit","Archive exceeds the supported file count or expanded size"));}Ok(())
    }
    pub fn total(&self)->u64{self.total}
}
pub fn instance(root:&Path,id:&str)->Result<Instance> {
    instance_from_dir(&instance_dir(root,id)?,id)
}
pub fn instance_from_dir(dir:&Path,id:&str)->Result<Instance> {
    let path=dir.join("instance.json");
    let mut value:Instance=if path.is_file(){serde_json::from_slice(&crate::backend::protected_fs::read(path)?)?}else{
        let legacy:serde_json::Value=serde_json::from_slice(&crate::backend::protected_fs::read(dir.join("canary-instance.json"))?)?;
        let deps=&legacy["dependencies"]; let (loader,version)=["fabric-loader","quilt-loader","forge","neoforge"].iter().find_map(|key|deps[key].as_str().map(|version|(*key,Some(version.to_owned())))).unwrap_or(("vanilla",None));
        Instance {id:id.into(),name:legacy["name"].as_str().unwrap_or(id).into(),provider:"modrinth".into(),project_id:legacy["project_id"].as_str().map(str::to_owned),version_id:legacy["version_id"].as_str().map(str::to_owned),version_name:legacy["pack_version"].as_str().unwrap_or("").into(),minecraft:deps["minecraft"].as_str().unwrap_or("").into(),loader:loader.trim_end_matches("-loader").into(),loader_version:version,installed:fs::metadata(dir.join("canary-instance.json"))?.modified()?.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),..Instance::default()}
    };
    if value.id!=id{return Err(BackendError::new("metadata","Instance ID does not match its directory"));}
    value.directory=dir.to_string_lossy().into(); Ok(value)
}
pub fn instances(root:&Path)->Result<Vec<Instance>> {
    instances_in(&root.join("instances"))
}
pub fn instances_in(root:&Path)->Result<Vec<Instance>> {
    let mut out=vec![];
    for entry in fs::read_dir(root)? {
        let entry=entry?; let id=entry.file_name().to_string_lossy().into_owned();
        if id.starts_with('.')||!entry.file_type()?.is_dir(){continue;}
        match instance_from_dir(&safe_join(root,&id)?,&id) {Ok(mut value)=>{if matches!(value.status.as_str(),"preparing"|"running"|"stopping"|"downloading"){value.status="installed".into();}out.push(value)},Err(e)=>eprintln!("[instance][{}] {}",id,e.code)}
    }
    out.sort_by_key(|i|std::cmp::Reverse(i.installed)); Ok(out)
}
pub fn extract(archive:&Path,base:&Path)->Result<()> {extract_job(archive,base,None)}
pub fn extract_job(archive:&Path,base:&Path,job:Option<&super::download::Job>)->Result<()> {
    extract_limited(archive,base,job,ExtractionLimits::default())
}
pub fn extract_limited(archive:&Path,base:&Path,job:Option<&super::download::Job>,limits:ExtractionLimits)->Result<()> {
    let mut zip=zip::ZipArchive::new(crate::backend::protected_fs::open(archive)?).map_err(|e|BackendError::new("archive",e.to_string()))?;
    let mut budget=ExtractionBudget::new(limits);let mut names=std::collections::HashSet::new();
    if zip.len()>limits.entries{return Err(BackendError::new("archive_limit","Archive has too many entries"));}
    for i in 0..zip.len(){if let Some(job)=job{job.check()?;}let entry=zip.by_index(i).map_err(|e|BackendError::new("archive",e.to_string()))?;
        budget.entry(entry.size())?;let decoded_name=entry.name().map_err(|e|BackendError::new("archive",e.to_string()))?;let rel=decoded_name.trim_end_matches('/');if rel.is_empty(){continue;}
        safe_join(base,rel)?;
        if entry.unix_mode().is_some_and(|m|m&0o170000==0o120000)||!names.insert(rel.to_lowercase()){return Err(BackendError::new("archive","Archive has symbolic links or duplicate paths"));}
    }
    crate::backend::protected_fs::create_dir_all(base)?;
    if fs2::available_space(base).is_ok_and(|free|free<budget.total().saturating_add(64*1024*1024)){return Err(BackendError::new("disk_space","Not enough free space to expand this archive"));}
    for i in 0..zip.len(){if let Some(job)=job{job.check()?;}let mut entry=zip.by_index(i).map_err(|e|BackendError::new("archive",e.to_string()))?;
        let decoded_name=entry.name().map_err(|e|BackendError::new("archive",e.to_string()))?;let rel=decoded_name.trim_end_matches('/'); if rel.is_empty()||rel.starts_with("META-INF/"){continue;}
        if entry.unix_mode().is_some_and(|m|m&0o170000==0o120000){return Err(BackendError::new("archive","Archive contains symbolic links"));}
        let output=safe_join(base,rel)?;
        if entry.is_dir(){crate::backend::protected_fs::create_dir_all(output)?;}else{let expected=entry.size();let mut written=0u64;let mut file=crate::backend::protected_fs::create(output)?;{use std::io::Read;let mut buf=[0u8;128*1024];loop{if let Some(job)=job{job.check()?;}let n=entry.read(&mut buf)?;if n==0{break;}written=written.checked_add(n as u64).filter(|n|*n<=expected&&*n<=limits.entry_bytes).ok_or_else(||BackendError::new("archive_limit","Archive expanded size does not match its metadata"))?;file.write_all(&buf[..n])?;}}if written!=expected{return Err(BackendError::new("archive","Archive entry is truncated"));}}
    }Ok(())
}
#[cfg(test)] mod tests {use super::*;#[test]fn traversal(){for value in ["../x","C:/x","/x","a\\b","a/../b","CON.txt","a/NUL","x:stream","a/COM1.jar"]{assert!(safe_join(Path::new("safe"),value).is_err(),"{value}");}assert!(safe_join(Path::new("safe"),"mods/a.jar").is_ok());}
#[test]fn legacy_migration_preserves_identity_and_worlds(){let root=std::env::temp_dir().join(format!("canary-migration-{}",uuid::Uuid::new_v4()));let _cleanup=Staging(root.clone());let dir=instance_dir(&root,"project-version").unwrap();crate::backend::protected_fs::create_dir_all(dir.join("saves/World")).unwrap();crate::backend::protected_fs::write(dir.join("saves/World/level.dat"),b"world").unwrap();write_json(&dir.join("canary-instance.json"),&serde_json::json!({"name":"Existing pack","project_id":"project","version_id":"version","instance_path":"C:/untrusted/path","pack_version":"1.2","dependencies":{"minecraft":"1.21.1","fabric-loader":"0.16.0"}})).unwrap();let migrated=instance(&root,"project-version").unwrap();assert_eq!(migrated.loader,"fabric");assert_eq!(migrated.loader_version.as_deref(),Some("0.16.0"));assert_eq!(migrated.directory,dir.to_string_lossy());assert_eq!(migrated.version_id.as_deref(),Some("version"));write_json(&dir.join("instance.json"),&migrated).unwrap();assert_eq!(instance(&root,"project-version").unwrap().id,migrated.id);assert_eq!(crate::backend::protected_fs::read(dir.join("saves/World/level.dat")).unwrap(),b"world");}
}

pub fn replace(source:&Path,target:&Path)->Result<()> {
    crate::backend::protected_fs::rename(source,target)?;Ok(())
}

#[cfg(test)]
mod encoded_zip_name_tests {
    use super::*;
    use std::io::{Cursor, Write};
    #[test]
    fn encoded_traversal_names_fail_before_creating_destination_files() {
        let root=std::env::temp_dir().join(format!("canary-invalid-zip-name-{}",uuid::Uuid::new_v4()));
        let _cleanup=Staging(root.clone());
        fs::create_dir_all(&root).unwrap();
        let mut zip=zip::ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("safe/x.txt",zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored)).unwrap();
        zip.write_all(b"payload").unwrap();
        let mut bytes=zip.finish().unwrap().into_inner();
        // ZIP 9 also accepts legacy CP437 bytes. Validate the decoded path,
        // including traversal mixed with a non-UTF-8 filename component.
        bytes[30..40].copy_from_slice(b"../\xff/x.txt");
        let central=bytes.windows(4).position(|s|s==b"PK\x01\x02").unwrap();
        bytes[central+46..central+56].copy_from_slice(b"../\xff/x.txt");
        let archive=root.join("invalid.zip");fs::write(&archive,bytes).unwrap();
        let destination=root.join("destination");
        assert_eq!(extract(&archive,&destination).unwrap_err().code,"unsafe_path");
        assert!(!destination.exists());
    }
}
