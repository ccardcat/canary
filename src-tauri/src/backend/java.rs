use super::{Backend,download::{self,Artifact,Job},model::*,storage};
use std::{path::{Path,PathBuf},sync::Arc};
pub fn major(version:&str)->Option<u32>{let raw=version.trim_matches('"');let mut parts=raw.split(['.','-','_','+']);let n=parts.next()?.parse().ok()?;if n==1{parts.next()?.parse().ok()}else{Some(n)}}
pub async fn test(path:&Path,managed:bool)->Result<JavaRuntime>{
    if !path.is_file(){return Err(BackendError::new("java","Java executable does not exist"));}
    let mut command=tokio::process::Command::new(path);command.args(["-XshowSettings:properties","-version"]).kill_on_drop(true);
    #[cfg(windows)] command.creation_flags(0x08000000);
    let output=tokio::time::timeout(std::time::Duration::from_secs(12),command.output()).await.map_err(|_|BackendError::new("java","Java validation timed out"))??;
    if !output.status.success(){return Err(BackendError::new("java","Java validation failed"));}
    let text=format!("{}\n{}",String::from_utf8_lossy(&output.stderr),String::from_utf8_lossy(&output.stdout));
    let property=|key:&str|text.lines().find_map(|l|l.trim().strip_prefix(&format!("{key} = ")).map(str::to_owned));
    let version=property("java.version").or_else(||text.split('"').nth(1).map(str::to_owned)).ok_or_else(||BackendError::new("java","Cannot determine Java version"))?;
    Ok(JavaRuntime{path:std::fs::canonicalize(path)?.to_string_lossy().into(),major:major(&version).ok_or_else(||BackendError::new("java","Invalid Java version"))?,version,architecture:property("os.arch").unwrap_or_default(),vendor:property("java.vendor").unwrap_or_default(),managed})
}
pub async fn detect(root:&Path)->Result<Vec<JavaRuntime>>{
    let mut candidates=vec![];if let Some(home)=std::env::var_os("JAVA_HOME"){candidates.push(PathBuf::from(home).join("bin/java.exe"));}
    if let Some(paths)=std::env::var_os("PATH"){for dir in std::env::split_paths(&paths){candidates.push(dir.join("java.exe"));}}
    fn scan(dir:&Path,depth:u8,out:&mut Vec<PathBuf>){if out.len()>100||depth==0{return;}if dir.join("bin/java.exe").is_file(){out.push(dir.join("bin/java.exe"));return;}if let Ok(entries)=std::fs::read_dir(dir){for entry in entries.flatten(){if entry.file_type().is_ok_and(|t|t.is_dir()){scan(&entry.path(),depth-1,out);}}}}
    scan(&root.join("java"),4,&mut candidates);
    for key in ["ProgramFiles","ProgramFiles(x86)","LOCALAPPDATA"]{if let Some(base)=std::env::var_os(key){for dir in ["Java","Eclipse Adoptium","Microsoft","Zulu","BellSoft","Programs/Eclipse Adoptium"]{scan(&PathBuf::from(&base).join(dir),3,&mut candidates);}}}
    candidates.sort();candidates.dedup();let mut result=vec![];for candidate in candidates{if let Ok(value)=test(&candidate,candidate.starts_with(root.join("java"))).await {if !result.iter().any(|r:&JavaRuntime|r.path.eq_ignore_ascii_case(&value.path)){result.push(value);}}}Ok(result)
}
pub async fn select(backend:Arc<Backend>,instance:&Instance,required:u32,job:Arc<Job>)->Result<JavaRuntime>{
    use std::sync::atomic::Ordering;
    job.files.store(0,Ordering::Relaxed);job.completed.store(0,Ordering::Relaxed);job.downloaded.store(0,Ordering::Relaxed);job.total.store(0,Ordering::Relaxed);job.emit("java","running",&required.to_string());job.check()?;
    let settings=backend.settings();
    if let Some(path)=instance.overrides.java.as_ref().or(settings.java_path.as_ref()) {
        let java=test(Path::new(path),Path::new(path).starts_with(backend.root.join("java"))).await?;
        if java.major!=required||!compatible_arch(&java.architecture){return Err(BackendError::new("java_incompatible",format!("Minecraft requires Java {required} with matching Windows architecture; selected runtime is Java {} ({})",java.major,java.architecture)));}return Ok(java);
    }
    if let Some(java)=detect(&backend.root).await?.into_iter().find(|j|j.major==required&&compatible_arch(&j.architecture)){return Ok(java);}
    if !settings.automatic_java{return Err(BackendError::new("java_missing",format!("Install or select Java {required}")));}
    job.emit("java","running",&required.to_string());
    let arch=if cfg!(target_arch="aarch64"){"aarch64"}else{"x64"};
    let metadata=download::json(&backend,&format!("https://api.adoptium.net/v3/assets/latest/{required}/hotspot?architecture={arch}&image_type=jre&os=windows&vendor=eclipse")).await?;
    let package=&metadata[0]["binary"]["package"];let hash=package["checksum"].as_str().ok_or_else(||BackendError::new("java","Runtime checksum missing"))?;
    let archive=backend.root.join("cache").join(format!("java-{required}-{hash}.zip"));
    download::batch(backend.clone(),vec![Artifact{url:package["link"].as_str().ok_or_else(||BackendError::new("java","Runtime download URL missing"))?.into(),path:archive.clone(),hash:Some(hash.into()),algorithm:"sha256",size:package["size"].as_u64()}],job.clone(),"java").await?;
    let target=backend.root.join("java").join(format!("{required}-{hash}"));let staging=backend.root.join("temp").join(format!("java-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(staging.clone());let extract=staging.clone();
    tokio::task::spawn_blocking(move||storage::extract(&archive,&extract)).await.map_err(|e|BackendError::new("java",e.to_string()))??;
    let mut executable=None;for entry in std::fs::read_dir(&staging)?{let entry=entry?;let path=entry.path().join("bin/java.exe");if path.is_file(){executable=Some(path);break;}}
    let checked=test(&executable.ok_or_else(||BackendError::new("java","Runtime archive has no Java executable"))?,true).await?;
    if checked.major!=required{return Err(BackendError::new("java","Downloaded runtime version mismatch"));}job.check()?;
    if !target.exists(){std::fs::rename(&staging,&target)?;}else{std::fs::remove_dir_all(&staging)?;}
    let runtimes=detect(&backend.root).await?;runtimes.into_iter().find(|j|Path::new(&j.path).starts_with(std::fs::canonicalize(&target).unwrap_or(target.clone()))).ok_or_else(||BackendError::new("java","Installed Java validation failed"))
}
fn compatible_arch(arch:&str)->bool{if cfg!(target_arch="aarch64"){matches!(arch,"aarch64"|"arm64")}else{matches!(arch,"amd64"|"x86_64")}}
#[cfg(test)]mod tests{use super::*;#[test]fn java_versions(){assert_eq!(major("1.8.0_412"),Some(8));assert_eq!(major("21.0.4+7"),Some(21));assert_eq!(major("25-ea"),Some(25));assert_eq!(major("bad"),None);}}
