use super::{model::*, Backend};
use sha2::{Digest, Sha256, Sha512};
use std::{path::{Path,PathBuf}, sync::{Arc, atomic::{AtomicBool,AtomicU64,Ordering}}, time::Instant};
use tauri::{AppHandle,Emitter};
use tokio::io::AsyncWriteExt;
#[derive(Clone)]
pub struct Artifact {pub url:String,pub path:PathBuf,pub hash:Option<String>,pub algorithm:&'static str,pub size:Option<u64>}
impl std::fmt::Debug for Artifact {fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result{f.debug_struct("Artifact").field("url",&"<download URL>").field("path",&super::privacy::diagnostic(&self.path.to_string_lossy())).field("algorithm",&self.algorithm).field("size",&self.size).finish()}}
// RustCrypto 0.11 returns hybrid arrays without LowerHex. Preserve the
// lowercase, zero-padded checksums and fingerprints used by existing storage.
pub(crate) fn hex(bytes: impl AsRef<[u8]>) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let bytes = bytes.as_ref();
    let mut result = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        result.push(DIGITS[(byte >> 4) as usize] as char);
        result.push(DIGITS[(byte & 15) as usize] as char);
    }
    result
}
pub const MAX_FILE_BYTES:u64=16*1024*1024*1024;
pub fn validate_hash(hash:&str,algorithm:&str)->Result<()> {
    let length=match algorithm{"sha1"=>40,"sha256"=>64,"sha512"=>128,_=>0};
    if length==0||hash.len()!=length||!hash.chars().all(|c|c.is_ascii_hexdigit()){return Err(BackendError::new("checksum","Publisher checksum has an invalid format"));}Ok(())
}
pub struct Job {pub content_history:AtomicBool,pub activity:Option<Arc<Backend>>,pub activity_tick:std::sync::Mutex<(String,Instant)>,pub id:String,pub app:Option<AppHandle>,pub cancel:Arc<AtomicBool>,pub downloaded:AtomicU64,pub total:AtomicU64,pub completed:AtomicU64,pub files:AtomicU64,pub network:AtomicU64,start:Instant,diagnostic:std::sync::Mutex<(String,u8)>}
impl Job {
    pub fn new(id:&str,app:Option<AppHandle>,cancel:Arc<AtomicBool>)->Self {Self{content_history:AtomicBool::new(false),activity:None,activity_tick:std::sync::Mutex::new((String::new(),Instant::now())),id:id.into(),app,cancel,downloaded:AtomicU64::new(0),total:AtomicU64::new(0),completed:AtomicU64::new(0),files:AtomicU64::new(0),network:AtomicU64::new(0),start:Instant::now(),diagnostic:std::sync::Mutex::new((String::new(),255))}}
    pub fn operation_id(&self)->String {self.activity.as_ref().and_then(|b|b.tasks.lock().unwrap().get(&self.id).map(|r|r.task.operation_id.clone())).unwrap_or_else(||self.id.clone())}
    pub fn elapsed(&self)->std::time::Duration{self.start.elapsed()}
    pub fn check(&self)->Result<()> {if self.cancel.load(Ordering::Relaxed){Err(BackendError::new("cancelled","Operation cancelled"))}else{Ok(())}}
    pub fn emit(&self,stage:&str,status:&str,file:&str){self.activity_progress(stage,file,status!="running");let downloaded=self.downloaded.load(Ordering::Relaxed);let total=self.total.load(Ordering::Relaxed);let elapsed=self.start.elapsed().as_secs().max(1);
        if self.app.is_none(){let bucket=if total>0{((downloaded as f64/total as f64)*5.).min(5.) as u8}else{0};let mut prior=self.diagnostic.lock().unwrap();if prior.0!=stage||prior.1!=bucket||status!="running"{eprintln!("[{stage}][{status}] {}/{} files, {downloaded}/{total} bytes",self.completed.load(Ordering::Relaxed),self.files.load(Ordering::Relaxed));*prior=(stage.into(),bucket);}}
        if let Some(app)=&self.app {let _=app.emit("backend-progress",Event{id:self.operation_id(),stage:stage.into(),status:status.into(),file:file.into(),completed:self.completed.load(Ordering::Relaxed),total:self.files.load(Ordering::Relaxed),downloaded,bytes_total:total,percent:if total>0{(downloaded as f64/total as f64*100.).min(100.)}else if self.files.load(Ordering::Relaxed)>0{self.completed.load(Ordering::Relaxed) as f64/self.files.load(Ordering::Relaxed) as f64*100.}else{0.},speed:self.network.load(Ordering::Relaxed)/elapsed});}
    }
}
impl Drop for Job {
    fn drop(&mut self){
        if self.activity.is_some(){self.finish(&Err::<(),_>(BackendError::new(if self.cancel.load(Ordering::Acquire){"cancelled"}else{"task_interrupted"},"The operation ended before completion")));}
    }
}
pub fn hash(path:&Path,algorithm:&str)->Result<String>{hash_cancellable(path,algorithm,None)}
pub fn hash_cancellable(path:&Path,algorithm:&str,cancel:Option<&AtomicBool>)->Result<String>{
    let mut file=crate::backend::protected_fs::open(path)?;hash_reader(&mut file,algorithm,cancel)
}
pub fn hash_reader(file:&mut impl std::io::Read,algorithm:&str,cancel:Option<&AtomicBool>)->Result<String>{
    let mut buf=[0u8;128*1024];
    enum Hasher {One(sha1::Sha1),Two(Sha256),Five(Sha512)}
    let mut h=match algorithm{"sha1"=>Hasher::One(sha1::Sha1::new()),"sha256"=>Hasher::Two(Sha256::new()),"sha512"=>Hasher::Five(Sha512::new()),_=>return Err(BackendError::new("hash","Unsupported hash algorithm"))};
    loop {if cancel.is_some_and(|c|c.load(Ordering::Acquire)){return Err(BackendError::new("cancelled","Operation cancelled"));}let n=file.read(&mut buf)?;if n==0{break;}match &mut h{Hasher::One(h)=>h.update(&buf[..n]),Hasher::Two(h)=>h.update(&buf[..n]),Hasher::Five(h)=>h.update(&buf[..n])}}
    Ok(match h{Hasher::One(h)=>crate::backend::download::hex(h.finalize()),Hasher::Two(h)=>crate::backend::download::hex(h.finalize()),Hasher::Five(h)=>crate::backend::download::hex(h.finalize())})
}
pub async fn valid(file:&Artifact)->Result<bool>{valid_cancellable(file,None).await}
pub async fn valid_job(file:&Artifact,job:&Job)->Result<bool>{valid_cancellable(file,Some(job.cancel.clone())).await}
async fn valid_cancellable(file:&Artifact,cancel:Option<Arc<AtomicBool>>)->Result<bool>{
    if let Some(hash)=&file.hash{validate_hash(hash,file.algorithm)?;}
    let metadata=match tokio::fs::metadata(&file.path).await{Ok(m)=>m,Err(_)=>return Ok(false)};
    if file.size.is_some_and(|s|metadata.len()!=s){return Ok(false);}
    let Some(expected)=file.hash.clone()else{return Ok(false)};let path=file.path.clone();let algorithm=file.algorithm;
    let actual=tokio::task::spawn_blocking(move||hash_cancellable(&path,algorithm,cancel.as_deref())).await.map_err(|e|BackendError::new("hash",e.to_string()))??;
    Ok(actual.eq_ignore_ascii_case(&expected))
}
pub async fn file(backend:&Backend,item:&Artifact,job:&Job,stage:&str)->Result<()> {
    job.check()?;
    if item.size.is_some_and(|size|size>MAX_FILE_BYTES){return Err(BackendError::new("download_limit","Artifact exceeds the 16 GiB per-file download budget"));}
    if let Some(hash)=&item.hash{validate_hash(hash,item.algorithm)?;}
    if valid_job(item,job).await? {job.check()?;job.downloaded.fetch_add(item.size.unwrap_or(std::fs::metadata(&item.path)?.len()),Ordering::Relaxed);job.completed.fetch_add(1,Ordering::Relaxed);job.emit(stage,"running",&item.path.file_name().unwrap_or_default().to_string_lossy());return Ok(());}
    let parsed=reqwest::Url::parse(&item.url).map_err(|_|BackendError::new("download","Invalid download URL"))?;
    super::network::request_url(&parsed)?;
    let parent=super::protected_fs::Parent::new(&item.path,true)?;
    let mut last=BackendError::new("download","Download failed");
    for attempt in 0..3 {
        job.check()?;let mut received=0u64;
        let (partial,handle)=parent.temporary()?;
        let _cleanup=parent.guard(&partial)?;
        let result:Result<()>=async {
            let request=super::curseforge::download_response(backend,&parsed);tokio::pin!(request);
            let mut response=loop{tokio::select!{result=&mut request=>break result?,_=tokio::time::sleep(std::time::Duration::from_millis(250))=>{job.check()?;}}};
            super::network::request_url(response.url())?;
            if !response.status().is_success(){return Err(BackendError::new(&format!("http_{}",response.status().as_u16()),"Artifact download failed"));}
            let length=item.size.or(response.content_length());if length.is_some_and(|size|size>MAX_FILE_BYTES){return Err(BackendError::new("download_limit","Artifact exceeds the 16 GiB per-file download budget"));}if length.is_some_and(|size|fs2::available_space(item.path.parent().unwrap()).is_ok_and(|free|free<size.saturating_add(64*1024*1024))){return Err(BackendError::new("disk_space","Insufficient free space for this download"));}let mut output=tokio::fs::File::from_std(handle);let mut tick=Instant::now();
            let streamed:Result<()>=async {loop {
                let chunk=tokio::select!{result=response.chunk()=>result?,_=tokio::time::sleep(std::time::Duration::from_millis(250))=>{job.check()?;continue;}};
                let Some(chunk)=chunk else{break;};
                job.check()?;if received.saturating_add(chunk.len() as u64)>length.unwrap_or(MAX_FILE_BYTES).min(MAX_FILE_BYTES){return Err(BackendError::new("checksum","Download exceeds the declared file size or download budget"));}if tick.elapsed().as_millis()>120&&fs2::available_space(item.path.parent().unwrap()).is_ok_and(|free|free<64*1024*1024){return Err(BackendError::new("disk_space","Download stopped before exhausting disk space"));}output.write_all(&chunk).await?;received+=chunk.len() as u64;job.network.fetch_add(chunk.len() as u64,Ordering::Relaxed);job.downloaded.fetch_add(chunk.len() as u64,Ordering::Relaxed);
                if tick.elapsed().as_millis()>120 {job.emit(stage,"running",&item.path.file_name().unwrap_or_default().to_string_lossy());tick=Instant::now();}
            }Ok(())}.await;
            // Tokio writes use blocking workers: flush even on cancellation before cleanup.
            let flushed=output.flush().await;let synced=if streamed.is_ok(){output.sync_all().await}else{Ok(())};let mut verified=output.into_std().await;streamed?;flushed?;synced?;job.check()?;
            if length.is_some_and(|s|s!=received){return Err(BackendError::new("checksum","Downloaded length does not match metadata"));}
            job.check()?;if let Some(expected)=&item.hash {let algorithm=item.algorithm;let cancel=job.cancel.clone();let actual=tokio::task::spawn_blocking(move||{use std::io::Seek;verified.rewind()?;hash_reader(&mut verified,algorithm,Some(&cancel))}).await.map_err(|e|BackendError::new("hash",e.to_string()))??;if !actual.eq_ignore_ascii_case(expected){return Err(BackendError::new("checksum","Artifact checksum mismatch"));}}else{drop(verified);}
            job.check()?;parent.commit(&partial)?;Ok(())
        }.await;
        match result {Ok(())=>{job.completed.fetch_add(1,Ordering::Relaxed);job.emit(stage,"running",&item.path.file_name().unwrap_or_default().to_string_lossy());return Ok(())},Err(e)=>{job.downloaded.fetch_sub(received,Ordering::Relaxed);if let Err(cleanup)=parent.remove_temporary(&partial){if cleanup.kind()!=std::io::ErrorKind::NotFound{return Err(BackendError::new("cleanup",format!("Could not remove partial download: {cleanup}")));}}last=e;if last.code=="cancelled"{break;}if !last.retryable && last.code!="checksum"{break;}if attempt<2{cancellable(job,async{tokio::time::sleep(std::time::Duration::from_secs(1<<attempt)).await;Ok(())}).await?;}}}
    }Err(last)
}
pub async fn batch(backend:Arc<Backend>,items:Vec<Artifact>,job:Arc<Job>,stage:&'static str)->Result<()> {
    if items.len()>200_000{return Err(BackendError::new("download_limit","Manifest has too many files"));}
    let total=items.iter().filter_map(|i|i.size).try_fold(0u64,|sum,size|sum.checked_add(size)).ok_or_else(||BackendError::new("download_limit","Manifest size overflow"))?;
    job.files.store(items.len() as u64,Ordering::Relaxed);job.total.store(if items.iter().all(|i|i.size.is_some()){total}else{0},Ordering::Relaxed);job.downloaded.store(0,Ordering::Relaxed);job.completed.store(0,Ordering::Relaxed);
    let mut tasks=tokio::task::JoinSet::new();let limit=backend.settings().concurrency.clamp(1,8);
    let mut iter=items.into_iter();let mut exhausted=false;
    loop {
        while tasks.len()<limit&&!exhausted&&!job.cancel.load(Ordering::Acquire) {if let Some(item)=iter.next(){let b=backend.clone();let j=job.clone();tasks.spawn(async move{file(&b,&item,&j,stage).await});}else{exhausted=true;}}
        let Some(result)=tasks.join_next().await else {break};
        if let Err(error)=result.unwrap_or_else(|e|Err(BackendError::new("download",e.to_string()))) {job.cancel.store(true,Ordering::Relaxed);while tasks.join_next().await.is_some(){}return Err(error);}
    }job.check()?;Ok(())
}
pub async fn json(backend:&Backend,url:&str)->Result<serde_json::Value>{
    super::network::request_url(&reqwest::Url::parse(url).map_err(|_|BackendError::new("unsafe_url","Invalid metadata URL"))?)?;
    let response=backend.client.get(url).send().await?;if !response.status().is_success(){return Err(BackendError::new(&format!("http_{}",response.status().as_u16()),"Metadata request failed"));}super::network::json(response).await
}
pub async fn cancellable<T>(job:&Job,future:impl std::future::Future<Output=Result<T>>)->Result<T>{
    tokio::pin!(future);job.check()?;
    loop{tokio::select!{result=&mut future=>return result,_=tokio::time::sleep(std::time::Duration::from_millis(150))=>{job.check()?;}}}
}
#[cfg(test)]mod tests {
    use super::*;
    #[test]fn streaming_hash(){let path=std::env::temp_dir().join(format!("canary-hash-{}",uuid::Uuid::new_v4()));crate::backend::protected_fs::write(&path,b"abc").unwrap();assert_eq!(hash(&path,"sha256").unwrap(),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");crate::backend::protected_fs::remove_file(path).unwrap();}
    #[test]fn rustcrypto_upgrade_preserves_publisher_checksums(){
        for (algorithm, expected) in [
            ("sha1", "a9993e364706816aba3e25717850c26c9cd0d89d"),
            ("sha256", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
            ("sha512", "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"),
        ] {
            let mut input = std::io::Cursor::new(b"abc");
            assert_eq!(hash_reader(&mut input, algorithm, None).unwrap(), expected);
        }
    }
}
#[cfg(test)]mod cancellation_tests {
    use super::*;use tokio::{net::TcpListener,io::AsyncReadExt};
    #[tokio::test]async fn mid_file_cancel_drains_workers_and_never_starts_next_file(){
        let root=std::env::temp_dir().join(format!("canary-stream-cancel-{}",uuid::Uuid::new_v4()));let _cleanup=super::super::storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root.clone()).unwrap());b.store.lock().unwrap().settings.concurrency=1;
        let listener=TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();let requests=Arc::new(AtomicU64::new(0));let count=requests.clone();
        let server=tokio::spawn(async move{loop{let (mut socket,_)=listener.accept().await.unwrap();count.fetch_add(1,Ordering::Relaxed);tokio::spawn(async move{let mut request=[0u8;4096];let _=socket.read(&mut request).await;if socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 1048576\r\nConnection: close\r\n\r\n").await.is_err(){return;}for _ in 0..128{if socket.write_all(&[42u8;8192]).await.is_err(){break;}tokio::time::sleep(std::time::Duration::from_millis(100)).await;}});}});
        let token=Arc::new(AtomicBool::new(false));let job=Arc::new(Job::new("cancel-test",None,token.clone()));let work_job=job.clone();let work_backend=b.clone();let files=(0..3).map(|i|Artifact{url:format!("http://{address}/{i}"),path:root.join("cache").join(format!("{i}.jar")),hash:None,algorithm:"sha256",size:Some(1048576)}).collect();let work=tokio::spawn(async move{batch(work_backend,files,work_job,"download").await});
        tokio::time::timeout(std::time::Duration::from_secs(3),async{while job.downloaded.load(Ordering::Relaxed)==0{tokio::time::sleep(std::time::Duration::from_millis(10)).await;}}).await.unwrap();token.store(true,Ordering::Release);
        let result=tokio::time::timeout(std::time::Duration::from_secs(2),work).await.unwrap().unwrap().unwrap_err();assert_eq!(result.code,"cancelled");assert_eq!(requests.load(Ordering::Relaxed),1);assert!(std::fs::read_dir(root.join("cache")).unwrap().next().is_none());server.abort();
    }
}
