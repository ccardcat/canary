use super::{Backend,download::{self,Artifact,Job},java,model::*,storage};
use std::{path::Path,sync::{Arc,atomic::Ordering},io::Read,process::Stdio};
use serde_json::{Value,json};
use tokio::io::{AsyncBufReadExt,BufReader};
fn location(instance:&Instance)->Result<(String,String)> {
    let version=instance.loader_version.as_deref().ok_or_else(||BackendError::new("loader","Select a loader version"))?;
    if !super::loader_catalog::valid_version(version){return Err(BackendError::new("loader","Invalid loader version"));}
    match instance.loader.as_str(){
        "forge"=>{let full=if version.starts_with(&format!("{}-",instance.minecraft)){version.into()}else{format!("{}-{version}",instance.minecraft)};Ok((format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{full}/forge-{full}-installer.jar"),full))},
        "neoforge"=>{let repo=super::loader_catalog::installer_repository(&instance.minecraft,"neoforge")?;let artifact=if instance.minecraft=="1.20.1"{"forge"}else{"neoforge"};Ok((format!("{repo}/{version}/{artifact}-{version}-installer.jar"),version.into()))},
        _=>Err(BackendError::new("loader_unsupported","Not an installer-based loader"))
    }
}
pub async fn versions(backend:&Backend,mc:&str,loader:&str)->Result<Value> {
    super::loader_catalog::versions(backend,mc,loader).await
}
fn archive_json(path:&Path,name:&str)->Result<Value> {
    let mut archive=zip::ZipArchive::new(std::fs::File::open(path)?).map_err(|e|BackendError::new("loader",e.to_string()))?;
    let file=archive.by_name(name.trim_start_matches('/')).map_err(|e|BackendError::new("loader",e.to_string()))?;
    if file.size()>2*1024*1024{return Err(BackendError::new("loader","Loader metadata is too large"));}
    let mut bytes=vec![];file.take(2*1024*1024+1).read_to_end(&mut bytes)?;Ok(serde_json::from_slice(&bytes)?)
}
fn copy_libraries(source:&Path,dest:&Path)->Result<()> {
    fn walk(base:&Path,dir:&Path,dest:&Path)->Result<()> {
        for entry in std::fs::read_dir(dir)?{let entry=entry?;if entry.file_type()?.is_symlink(){return Err(BackendError::new("unsafe_path","Loader generated a symbolic link"));}
            if entry.file_type()?.is_dir(){walk(base,&entry.path(),dest)?;}else{
                let path=entry.path();let rel=path.strip_prefix(base).map_err(|_|BackendError::new("unsafe_path","Invalid loader output"))?.to_string_lossy().replace('\\',"/");let target=storage::safe_join(dest,&rel)?;
                std::fs::create_dir_all(target.parent().unwrap())?;
                if target.is_file()&&download::hash(&target,"sha256")?==download::hash(&path,"sha256")?{continue;}
                let temporary=target.with_extension(format!("{}.part",uuid::Uuid::new_v4()));std::fs::copy(&path,&temporary)?;std::fs::rename(temporary,&target)?;
                std::fs::write(target.with_extension("sha256"),download::hash(&target,"sha256")?)?;
            }
        }Ok(())
    }walk(source,source,dest)
}
// Pre-1.13 installers embed their universal library and versionInfo directly.
// The containing installer has already been verified against the publisher SHA-1.
fn legacy_profile(backend:&Backend,instance:&Instance,archive:&Path,install:&Value,receipt:&Path,job:&Job)->Result<Value>{
 if install["install"]["minecraft"]!=instance.minecraft||install["versionInfo"]["inheritsFrom"].as_str().is_some_and(|v|v!=instance.minecraft){return Err(BackendError::new("loader","Installer targets a different Minecraft version"));}
 let coordinate=install["install"]["path"].as_str().ok_or_else(||BackendError::new("loader","Legacy installer library missing"))?;
 let relative=super::minecraft::maven_path(coordinate,None)?;
 let path=storage::safe_join(&backend.root.join("cache/libraries"),&relative)?;
 let entry=install["install"]["filePath"].as_str().ok_or_else(||BackendError::new("loader","Legacy installer payload missing"))?;
 let mut zip=zip::ZipArchive::new(std::fs::File::open(archive)?).map_err(|e|BackendError::new("loader",e.to_string()))?;
 let mut payload=zip.by_name(entry).map_err(|e|BackendError::new("loader",e.to_string()))?;
 if payload.size()>128*1024*1024{return Err(BackendError::new("loader","Legacy installer payload is too large"));}
 job.check()?;std::fs::create_dir_all(path.parent().unwrap())?;
 let temporary=path.with_extension(format!("{}.part",uuid::Uuid::new_v4()));
 let copied:Result<()>= (||{use std::io::Write;let mut output=std::fs::File::create(&temporary)?;let mut buffer=[0u8;131072];loop{job.check()?;let n=payload.read(&mut buffer)?;if n==0{break;}output.write_all(&buffer[..n])?;}output.sync_all()?;Ok(())})();
 if let Err(error)=copied{let _=std::fs::remove_file(&temporary);return Err(error);}
 storage::replace(&temporary,&path)?;std::fs::write(path.with_extension("sha256"),download::hash(&path,"sha256")?)?;
 let mut child=install["versionInfo"].clone();
 if !child["libraries"].is_array()||!child["mainClass"].is_string(){return Err(BackendError::new("loader","Legacy version profile is invalid"));}
 // Explicitly point the embedded Forge artifact to the verified cache receipt.
 for lib in child["libraries"].as_array_mut().unwrap(){if lib["name"]==coordinate{lib["url"]=json!("https://maven.minecraftforge.net/");}}
 storage::write_json(receipt,&json!({"loader_version":instance.loader_version,"profile":child,"files":[{"path":path,"size":std::fs::metadata(&path)?.len()}]}))?;
 job.check()?;Ok(child)
}
// Delegate processor execution and output verification to the publisher's
// actual headless installer. It operates only in a fresh Canary staging root.
pub async fn profile(backend:Arc<Backend>,instance:&Instance,parent:&Value,client:&Artifact,job:Arc<Job>,deep:bool)->Result<Value> {
    let dir=backend.instance_path(&instance.id)?;let receipt=dir.join("loader.json");
    if !deep&&receipt.is_file(){let value:Value=serde_json::from_slice(&std::fs::read(&receipt)?)?;
        if value["loader_version"].as_str()==instance.loader_version.as_deref()&&value["files"].as_array().is_some_and(|files|!files.is_empty()&&files.iter().all(|f|f["path"].as_str().zip(f["size"].as_u64()).is_some_and(|(p,size)|std::fs::metadata(p).is_ok_and(|m|m.len()==size)))){return Ok(value["profile"].clone());}}
    let (url,version)=location(instance)?;let response=download::cancellable(&job,async{Ok(backend.client.get(format!("{url}.sha1")).send().await?.error_for_status()?.text().await?)}).await?;
    let checksum=response.split_whitespace().next().filter(|s|s.len()==40&&s.chars().all(|c|c.is_ascii_hexdigit())).ok_or_else(||BackendError::new("loader","Official installer checksum missing"))?;
    let archive=storage::safe_join(&backend.root.join("cache/loaders"),&format!("{}-{version}.jar",instance.loader))?;
    download::batch(backend.clone(),vec![Artifact{url,path:archive.clone(),hash:Some(checksum.into()),algorithm:"sha1",size:None},client.clone()],job.clone(),"loader").await?;
    let install=archive_json(&archive,"install_profile.json")?;
    if install.get("versionInfo").is_some(){return legacy_profile(&backend,instance,&archive,&install,&receipt,&job);}
    if install["minecraft"].as_str()!=Some(&instance.minecraft){return Err(BackendError::new("loader","Installer targets a different Minecraft version"));}
    let child=archive_json(&archive,install["json"].as_str().ok_or_else(||BackendError::new("loader_unsupported","Legacy installer schema is not supported"))?)?;
    let runtime=java::select(backend.clone(),instance,parent["javaVersion"]["majorVersion"].as_u64().unwrap_or(8) as u32,job.clone()).await?;
    let staging=backend.root.join("temp").join(format!("loader-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(staging.clone());std::fs::create_dir_all(&staging)?;
    storage::write_json(&staging.join("launcher_profiles.json"),&json!({"profiles":{}}))?;
    let vanilla=storage::safe_join(&staging.join("versions"),&instance.minecraft)?;std::fs::create_dir_all(&vanilla)?;
    std::fs::copy(&client.path,vanilla.join(format!("{}.jar",instance.minecraft)))?;storage::write_json(&vanilla.join(format!("{}.json",instance.minecraft)),parent)?;
    job.files.store(0,Ordering::Relaxed);job.total.store(0,Ordering::Relaxed);job.completed.store(0,Ordering::Relaxed);job.downloaded.store(0,Ordering::Relaxed);job.emit("loader","running",&instance.loader);
    let mut command=tokio::process::Command::new(runtime.path);command.args(["-Djava.awt.headless=true","-jar"]).arg(&archive).arg("--installClient").arg(&staging).current_dir(&staging).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    #[cfg(windows)]command.creation_flags(0x08000000);
    let mut process=command.spawn()?;
    let log=storage::safe_join(&dir,"logs/loader.log")?;std::fs::create_dir_all(log.parent().unwrap())?;
    async fn output<R:tokio::io::AsyncRead+Unpin>(stream:R,job:Arc<Job>,log:std::path::PathBuf){let mut lines=BufReader::new(stream).lines();while let Ok(Some(line))=lines.next_line().await{let line:String=line.chars().take(2048).collect();use std::io::Write;if let Ok(mut file)=std::fs::OpenOptions::new().create(true).append(true).open(&log){if file.metadata().is_ok_and(|m|m.len()<5*1024*1024){let _=writeln!(file,"{line}");}}job.emit("loader","running",&line);}}
    let out=tokio::spawn(output(process.stdout.take().unwrap(),job.clone(),log.clone()));let err=tokio::spawn(output(process.stderr.take().unwrap(),job.clone(),log));
    let started=std::time::Instant::now();let status=loop{if let Err(e)=job.check(){let _=process.kill().await;let _=out.await;let _=err.await;return Err(e);}if started.elapsed().as_secs()>900{let _=process.kill().await;return Err(BackendError::new("timeout","Loader installer timed out"));}if let Some(status)=process.try_wait()?{break status;}tokio::time::sleep(std::time::Duration::from_millis(200)).await;};let _=out.await;let _=err.await;
    if !status.success(){return Err(BackendError::new("loader","Official loader installer failed; see instance logs/loader.log"));}
    let source=staging.join("libraries");let target=backend.root.join("cache/libraries");let src=source.clone();let dst=target.clone();tokio::task::spawn_blocking(move||copy_libraries(&src,&dst)).await.map_err(|e|BackendError::new("loader",e.to_string()))??;
    let mut files=vec![];
    // Inventory only this installer's outputs, rather than the entire shared cache.
    fn outputs(base:&Path,dir:&Path,target:&Path,out:&mut Vec<Value>)->Result<()>{for entry in std::fs::read_dir(dir)?{let entry=entry?;if entry.file_type()?.is_dir(){outputs(base,&entry.path(),target,out)?;}else{let file=target.join(entry.path().strip_prefix(base).unwrap());out.push(json!({"path":file,"size":entry.metadata()?.len()}));}}Ok(())}
    outputs(&source,&source,&target,&mut files)?;
    storage::write_json(&receipt,&json!({"loader_version":instance.loader_version,"profile":child,"files":files}))?;job.check()?;Ok(child)
}
#[cfg(test)]mod tests{use super::*;#[test]fn installer_sources(){let i=Instance{minecraft:"1.21.1".into(),loader:"forge".into(),loader_version:Some("52.0.1".into()),..Instance::default()};assert!(location(&i).unwrap().0.ends_with("forge-1.21.1-52.0.1-installer.jar"));let i=Instance{loader_version:Some("../../escape".into()),..i};assert!(location(&i).is_err());}}

#[cfg(test)]mod legacy_tests{
 use super::*;
 #[test]fn embedded_legacy_forge_is_installed_without_executing_java(){
  use std::io::Write;
  let root=std::env::temp_dir().join(format!("canary-old-forge-{}",uuid::Uuid::new_v4()));
  let _cleanup=storage::Staging(root.clone());let backend=Backend::with_root(root.clone()).unwrap();
  let path=root.join("installer.jar");let mut zip=zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
  zip.start_file("forge-universal.jar",zip::write::SimpleFileOptions::default()).unwrap();zip.write_all(b"verified installer payload").unwrap();zip.finish().unwrap();
  let instance=Instance{minecraft:"1.7.10".into(),loader:"forge".into(),loader_version:Some("10.13.4.1614".into()),..Instance::default()};
  let profile=json!({"install":{"minecraft":"1.7.10","path":"net.minecraftforge:forge:1.7.10-10.13.4.1614","filePath":"forge-universal.jar"},"versionInfo":{"inheritsFrom":"1.7.10","mainClass":"net.minecraft.launchwrapper.Launch","libraries":[{"name":"net.minecraftforge:forge:1.7.10-10.13.4.1614"}]}});
  let job=Job::new("legacy",None,Arc::new(std::sync::atomic::AtomicBool::new(false)));
  let child=legacy_profile(&backend,&instance,&path,&profile,&root.join("loader.json"),&job).unwrap();
  let artifact=root.join("cache/libraries/net/minecraftforge/forge/1.7.10-10.13.4.1614/forge-1.7.10-10.13.4.1614.jar");
  assert_eq!(std::fs::read(&artifact).unwrap(),b"verified installer payload");assert!(artifact.with_extension("sha256").is_file());
  assert_eq!(child["mainClass"],"net.minecraft.launchwrapper.Launch");
  let wrong=Instance{minecraft:"1.12.2".into(),..instance};assert!(legacy_profile(&backend,&wrong,&path,&profile,&root.join("wrong.json"),&job).is_err());
 }
}
