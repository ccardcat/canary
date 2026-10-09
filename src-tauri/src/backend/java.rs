use super::{Backend,download::{self,Artifact,Job},model::*,storage};
use std::{path::{Path,PathBuf},sync::Arc};
fn executable()->&'static str{if cfg!(windows){"java.exe"}else{"java"}}
fn bin_path()->String{format!("bin/{}",executable())}
pub fn major(version:&str)->Option<u32>{let raw=version.trim_matches('"');let mut parts=raw.split(['.','-','_','+']);let n=parts.next()?.parse().ok()?;if n==1{parts.next()?.parse().ok()}else{Some(n)}}
pub fn executable_path(path:&Path)->Result<PathBuf>{
    if !path.is_absolute()||path.to_string_lossy().chars().any(|c|c.is_control()){return Err(BackendError::new("java_path","Choose an absolute path to a Java executable"));}
    #[cfg(windows)]{
        if !matches!(path.components().next(),Some(std::path::Component::Prefix(p)) if matches!(p.kind(),std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_)))||!path.extension().is_some_and(|s|s.eq_ignore_ascii_case("exe")){return Err(BackendError::new("java_path","Choose a local Java .exe, not a network, device or shell-script path"));}
    }
    let canonical=std::fs::canonicalize(path)?;
    if !canonical.is_file(){return Err(BackendError::new("java_path","Java executable is not a regular file"));}Ok(canonical)
}
pub fn authorize(backend:&Backend,app:&tauri::AppHandle,path:&Path)->Result<PathBuf>{
    use tauri_plugin_dialog::{DialogExt,MessageDialogButtons,MessageDialogKind};
    let canonical=executable_path(path)?;let key=canonical.to_string_lossy().into_owned();let hash=download::hash(&canonical,"sha256")?;
    if backend.store.lock().unwrap().trusted_java.get(&key)==Some(&hash){return Ok(canonical);}
    let message=format!("Выбранный executable будет запущен с вашими правами. Canary не подтверждает его издателя. Продолжайте только если доверяете источнику Java.\n\nThis executable will run with your OS permissions. Canary has not verified its publisher. Continue only if you trust its Java source.\n\n{key}\nSHA-256: {hash}");
    if !app.dialog().message(message).title("Canary — Custom Java / Своя Java").kind(MessageDialogKind::Warning).buttons(MessageDialogButtons::OkCancel).blocking_show(){return Err(BackendError::new("java_consent","Custom Java execution was not approved"));}
    backend.store.lock().unwrap().trusted_java.insert(key,hash);backend.persist()?;Ok(canonical)
}
pub async fn authorize_async(backend:Arc<Backend>,app:tauri::AppHandle,path:String)->Result<PathBuf>{
    tokio::task::spawn_blocking(move||authorize(&backend,&app,Path::new(&path))).await.map_err(|_|BackendError::new("java_path","Could not verify custom Java"))?
}
pub fn trusted_custom(backend:&Backend,path:&Path)->Result<PathBuf>{
    let canonical=executable_path(path)?;let hash=download::hash(&canonical,"sha256")?;
    if backend.store.lock().unwrap().trusted_java.get(canonical.to_string_lossy().as_ref())!=Some(&hash){return Err(BackendError::new("java_consent","Test and approve this custom Java executable in Minecraft settings before use"));}Ok(canonical)
}
pub fn validate_arguments(jvm:&[String],game:&[String])->Result<()> {
    if jvm.len()+game.len()>256||jvm.iter().chain(game).any(|s|s.len()>16*1024||s.contains('\0')){return Err(BackendError::new("arguments","Too many launch arguments or an invalid argument"));}
    super::launch_arguments::validate_jvm(jvm).and_then(|_|super::launch_arguments::validate_game(game)).map_err(|message|BackendError::new("arguments",message))
}
pub fn risky_arguments(jvm:&[String])->bool{super::launch_arguments::requires_consent(jvm)}
pub fn authorize_arguments(backend:&Backend,app:&tauri::AppHandle,jvm:&[String],game:&[String])->Result<()> {
    use tauri_plugin_dialog::{DialogExt,MessageDialogButtons,MessageDialogKind};validate_arguments(jvm,game)?;
    if !risky_arguments(jvm){return Ok(());}let fingerprint=argument_fingerprint(jvm)?;
    if backend.store.lock().unwrap().trusted_jvm.contains(&fingerprint){return Ok(());}
    let detail=super::privacy::diagnostic(&jvm.join("\n"));
    if !app.dialog().message(format!("Эти JVM-аргументы могут загружать дополнительный код с вашими правами. Подтвердите только доверенные параметры.\n\nThese JVM arguments can load additional code with your OS permissions. Approve only arguments you trust.\n\n{detail}")).title("Canary — JVM arguments / Аргументы JVM").kind(MessageDialogKind::Warning).buttons(MessageDialogButtons::OkCancel).blocking_show(){return Err(BackendError::new("java_consent","JVM code-loading arguments were not approved"));}
    backend.store.lock().unwrap().trusted_jvm.push(fingerprint);backend.persist()
}
fn argument_fingerprint(jvm:&[String])->Result<String>{use sha2::Digest;Ok(crate::backend::download::hex(sha2::Sha256::digest(serde_json::to_vec(jvm)?)))}
pub fn trusted_arguments(backend:&Backend,jvm:&[String],game:&[String])->Result<()>{validate_arguments(jvm,game)?;if risky_arguments(jvm)&&!backend.store.lock().unwrap().trusted_jvm.contains(&argument_fingerprint(jvm)?){return Err(BackendError::new("java_consent","Review JVM code-loading arguments in Minecraft settings before launch"));}Ok(())}
pub async fn test(path:&Path,managed:bool)->Result<JavaRuntime>{
    let canonical=executable_path(path)?;let path=canonical.as_path();
    let _executable_guard=super::protected_fs::execution_guard(path)?;
    if !path.is_file(){return Err(BackendError::new("java","Java executable does not exist"));}
    let mut command=tokio::process::Command::new(path);command.args(["-XshowSettings:properties","-version"]).kill_on_drop(true);
    super::privacy::child_environment(command.as_std_mut());
    #[cfg(windows)] command.creation_flags(0x08000000);
    use std::process::Stdio;
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child=command.spawn()?;let stdout=child.stdout.take().unwrap();let stderr=child.stderr.take().unwrap();
    async fn bounded<R:tokio::io::AsyncRead+Unpin>(reader:R)->Result<Vec<u8>>{use tokio::io::AsyncReadExt;let mut bytes=vec![];reader.take(128*1024+1).read_to_end(&mut bytes).await?;if bytes.len()>128*1024{return Err(BackendError::new("java","Java validation output exceeds its diagnostic budget"));}Ok(bytes)}
    let result=tokio::time::timeout(std::time::Duration::from_secs(12),async{let (out,err)=tokio::try_join!(bounded(stdout),bounded(stderr))?;let status=child.wait().await?;Ok::<_,BackendError>((status,out,err))}).await;
    let (status,stdout,stderr)=match result{Ok(Ok(value))=>value,other=>{let _=child.kill().await;let _=child.wait().await;return Err(match other{Ok(Err(error))=>error,_=>BackendError::new("java","Java validation timed out")});}};
    if !status.success(){return Err(BackendError::new("java","Java validation failed"));}
    let text=format!("{}\n{}",String::from_utf8_lossy(&stderr),String::from_utf8_lossy(&stdout));
    let property=|key:&str|text.lines().find_map(|l|l.trim().strip_prefix(&format!("{key} = ")).map(str::to_owned));
    let version=property("java.version").or_else(||text.split('"').nth(1).map(str::to_owned)).ok_or_else(||BackendError::new("java","Cannot determine Java version"))?;
    Ok(JavaRuntime{path:std::fs::canonicalize(path)?.to_string_lossy().into(),major:major(&version).ok_or_else(||BackendError::new("java","Invalid Java version"))?,version,architecture:property("os.arch").unwrap_or_default(),vendor:property("java.vendor").unwrap_or_default(),managed})
}
pub async fn detect(root:&Path)->Result<Vec<JavaRuntime>>{
    let mut candidates=vec![];if let Some(home)=std::env::var_os("JAVA_HOME"){candidates.push(PathBuf::from(home).join(bin_path()));}
    if let Some(paths)=std::env::var_os("PATH"){for dir in std::env::split_paths(&paths){candidates.push(dir.join(executable()));}}
    fn scan(dir:&Path,depth:u8,out:&mut Vec<PathBuf>){if out.len()>100||depth==0{return;}if dir.join(bin_path()).is_file(){out.push(dir.join(bin_path()));return;}if let Ok(entries)=std::fs::read_dir(dir){for entry in entries.flatten(){if entry.file_type().is_ok_and(|t|t.is_dir()){scan(&entry.path(),depth-1,out);}}}}
    scan(&root.join("java"),4,&mut candidates);
    for key in ["ProgramFiles","ProgramFiles(x86)","LOCALAPPDATA"]{if let Some(base)=std::env::var_os(key){for dir in ["Java","Eclipse Adoptium","Microsoft","Zulu","BellSoft","Programs/Eclipse Adoptium"]{scan(&PathBuf::from(&base).join(dir),3,&mut candidates);}}}
    #[cfg(not(windows))]scan(Path::new("/usr/lib/jvm"),3,&mut candidates);
    candidates.sort();candidates.dedup();let mut result=vec![];for candidate in candidates{if let Ok(value)=test(&candidate,candidate.starts_with(root.join("java"))).await {if !result.iter().any(|r:&JavaRuntime|r.path.eq_ignore_ascii_case(&value.path)){result.push(value);}}}Ok(result)
}
pub async fn select(backend:Arc<Backend>,instance:&Instance,required:u32,job:Arc<Job>)->Result<JavaRuntime>{
    use std::sync::atomic::Ordering;
    job.files.store(0,Ordering::Relaxed);job.completed.store(0,Ordering::Relaxed);job.downloaded.store(0,Ordering::Relaxed);job.total.store(0,Ordering::Relaxed);job.emit("java","running",&required.to_string());job.check()?;
    let settings=backend.settings();
    if let Some(path)=instance.overrides.java.as_ref().or(settings.java_path.as_ref()) {
        let approved=trusted_custom(&backend,Path::new(path))?;
        let java=download::cancellable(&job,test(&approved,approved.starts_with(backend.root.join("java")))).await?;
        if java.major!=required||!compatible_arch(&java.architecture){return Err(BackendError::new("java_incompatible",format!("Minecraft requires Java {required} with matching system architecture; selected runtime is Java {} ({})",java.major,java.architecture)));}return Ok(java);
    }
    if let Some(java)=download::cancellable(&job,detect(&backend.root)).await?.into_iter().find(|j|j.major==required&&compatible_arch(&j.architecture)){return Ok(java);}
    if !settings.automatic_java{return Err(BackendError::new("java_missing",format!("Install or select Java {required}")));}
    job.emit("java","running",&required.to_string());
    let arch=if cfg!(target_arch="aarch64"){"aarch64"}else{"x64"};
    let os=if cfg!(windows){"windows"}else if cfg!(target_os="macos"){"mac"}else{"linux"};
    let metadata=download::cancellable(&job,download::json(&backend,&format!("https://api.adoptium.net/v3/assets/latest/{required}/hotspot?architecture={arch}&image_type=jre&os={os}&vendor=eclipse"))).await?;
    let package=&metadata[0]["binary"]["package"];let hash=package["checksum"].as_str().ok_or_else(||BackendError::new("java","Runtime checksum missing"))?;download::validate_hash(hash,"sha256")?;
    let archive=backend.root.join("cache").join(format!("java-{required}-{hash}.{}",if cfg!(windows){"zip"}else{"tar.gz"}));
    download::batch(backend.clone(),vec![Artifact{url:package["link"].as_str().ok_or_else(||BackendError::new("java","Runtime download URL missing"))?.into(),path:archive.clone(),hash:Some(hash.into()),algorithm:"sha256",size:package["size"].as_u64()}],job.clone(),"java").await?;
    let target=backend.root.join("java").join(format!("{required}-{hash}"));let staging=backend.root.join("temp").join(format!("java-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(staging.clone());let extract=staging.clone();let token=job.clone();
    tokio::task::spawn_blocking(move||if cfg!(windows){storage::extract_job(&archive,&extract,Some(&token))}else{extract_runtime_tar(&archive,&extract,Some(&token))}).await.map_err(|e|BackendError::new("java",e.to_string()))??;
    let mut executable=None;for entry in std::fs::read_dir(&staging)?{let entry=entry?;let path=entry.path().join(bin_path());if path.is_file(){executable=Some(path);break;}}
    let checked=test(&executable.ok_or_else(||BackendError::new("java","Runtime archive has no Java executable"))?,true).await?;
    if checked.major!=required{return Err(BackendError::new("java","Downloaded runtime version mismatch"));}job.check()?;
    if !target.exists(){crate::backend::protected_fs::rename(&staging,&target)?;}else{crate::backend::protected_fs::remove_dir_all(&staging)?;}
    let runtimes=detect(&backend.root).await?;let _=backend.record_activity("java_installed",&format!("Java {required}"),Some(&instance.id));runtimes.into_iter().find(|j|Path::new(&j.path).starts_with(std::fs::canonicalize(&target).unwrap_or(target.clone()))).ok_or_else(||BackendError::new("java","Installed Java validation failed"))
}
fn compatible_arch(arch:&str)->bool{if cfg!(target_arch="aarch64"){matches!(arch,"aarch64"|"arm64")}else{matches!(arch,"amd64"|"x86_64")}}
#[cfg(test)]mod tests{use super::*;#[test]fn java_versions(){assert_eq!(major("1.8.0_412"),Some(8));assert_eq!(major("21.0.4+7"),Some(21));assert_eq!(major("25-ea"),Some(25));assert_eq!(major("bad"),None);}}

fn extract_runtime_tar(archive:&Path,root:&Path,job:Option<&Job>)->Result<()> {
    let decoder=flate2::read::GzDecoder::new(crate::backend::protected_fs::open(archive)?);let mut archive=tar::Archive::new(decoder);crate::backend::protected_fs::create_dir_all(root)?;let mut links=vec![];let mut budget=storage::ExtractionBudget::new(storage::ExtractionLimits::default());let mut names=std::collections::HashSet::new();
    for entry in archive.entries()?{if let Some(job)=job{job.check()?;}let mut entry=entry?;let kind=entry.header().entry_type();let name=entry.path()?.to_string_lossy().trim_end_matches('/').to_owned();if name.is_empty(){continue;}budget.entry(entry.size())?;if !names.insert(name.to_ascii_lowercase()){return Err(BackendError::new("archive_limit","Duplicate runtime archive destination"));}let path=storage::safe_join(root,&name)?;
        if kind.is_dir(){crate::backend::protected_fs::create_dir_all(path)?;}else if kind.is_file(){if entry.size()>512*1024*1024{return Err(BackendError::new("java","Runtime archive entry too large"));}crate::backend::protected_fs::create_dir_all(path.parent().unwrap())?;let mut file=crate::backend::protected_fs::create(&path)?;{use std::io::{Read,Write};let mut buf=[0u8;128*1024];loop{if let Some(job)=job{job.check()?;}let n=entry.read(&mut buf)?;if n==0{break;}file.write_all(&buf[..n])?;}}#[cfg(unix)]{use std::os::unix::fs::PermissionsExt;std::fs::set_permissions(path,std::fs::Permissions::from_mode(entry.header().mode()?&0o777))?;}}
        else if kind.is_symlink()||kind.is_hard_link(){let target=entry.link_name()?.ok_or_else(||BackendError::new("java","Runtime link target missing"))?;if target.is_absolute(){return Err(BackendError::new("unsafe_path","Absolute runtime link"));}let base=if kind.is_hard_link(){root}else{path.parent().unwrap()};let mut resolved=base.to_path_buf();for component in target.components(){match component{std::path::Component::Normal(part)=>resolved.push(part),std::path::Component::CurDir=>{},std::path::Component::ParentDir=>{if resolved==root||!resolved.pop(){return Err(BackendError::new("unsafe_path","Runtime link escapes archive"));}},_=>return Err(BackendError::new("unsafe_path","Invalid runtime link"))}}if !resolved.starts_with(root){return Err(BackendError::new("unsafe_path","Runtime link escapes archive"));}links.push((path,resolved));}
        else{return Err(BackendError::new("unsafe_path","Unsupported runtime archive entry"));}}
    // Flatten verified internal links; the managed tree contains no symlinks.
    while !links.is_empty(){let before=links.len();let mut pending=vec![];for (path,target) in links{if let Some(job)=job{job.check()?;}if target.is_file(){budget.entry(std::fs::metadata(&target)?.len())?;crate::backend::protected_fs::create_dir_all(path.parent().unwrap())?;crate::backend::protected_fs::copy(target,path)?;}else{pending.push((path,target));}}if pending.len()==before{return Err(BackendError::new("java","Unresolvable runtime archive link"));}links=pending;}Ok(())
}
