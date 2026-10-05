use super::{model::*, Backend};
use sha2::{Digest, Sha256, Sha512};
use std::{path::{Path,PathBuf}, sync::{Arc, atomic::{AtomicBool,AtomicU64,Ordering}}, time::Instant};
use tauri::{AppHandle,Emitter};
use tokio::io::AsyncWriteExt;
#[derive(Clone,Debug)]
pub struct Artifact {pub url:String,pub path:PathBuf,pub hash:Option<String>,pub algorithm:&'static str,pub size:Option<u64>}
pub struct Job {pub id:String,pub app:Option<AppHandle>,pub cancel:Arc<AtomicBool>,pub downloaded:AtomicU64,pub total:AtomicU64,pub completed:AtomicU64,pub files:AtomicU64,pub network:AtomicU64,start:Instant,diagnostic:std::sync::Mutex<(String,u8)>}
impl Job {
    pub fn new(id:&str,app:Option<AppHandle>,cancel:Arc<AtomicBool>)->Self {Self{id:id.into(),app,cancel,downloaded:AtomicU64::new(0),total:AtomicU64::new(0),completed:AtomicU64::new(0),files:AtomicU64::new(0),network:AtomicU64::new(0),start:Instant::now(),diagnostic:std::sync::Mutex::new((String::new(),255))}}
    pub fn check(&self)->Result<()> {if self.cancel.load(Ordering::Relaxed){Err(BackendError::new("cancelled","Operation cancelled"))}else{Ok(())}}
    pub fn emit(&self,stage:&str,status:&str,file:&str){let downloaded=self.downloaded.load(Ordering::Relaxed);let total=self.total.load(Ordering::Relaxed);let elapsed=self.start.elapsed().as_secs().max(1);
        if self.app.is_none(){let bucket=if total>0{((downloaded as f64/total as f64)*5.).min(5.) as u8}else{0};let mut prior=self.diagnostic.lock().unwrap();if prior.0!=stage||prior.1!=bucket||status!="running"{eprintln!("[{stage}][{status}] {}/{} files, {downloaded}/{total} bytes",self.completed.load(Ordering::Relaxed),self.files.load(Ordering::Relaxed));*prior=(stage.into(),bucket);}}
        if let Some(app)=&self.app {let _=app.emit("backend-progress",Event{id:self.id.clone(),stage:stage.into(),status:status.into(),file:file.into(),completed:self.completed.load(Ordering::Relaxed),total:self.files.load(Ordering::Relaxed),downloaded,bytes_total:total,percent:if total>0{(downloaded as f64/total as f64*100.).min(100.)}else if self.files.load(Ordering::Relaxed)>0{self.completed.load(Ordering::Relaxed) as f64/self.files.load(Ordering::Relaxed) as f64*100.}else{0.},speed:self.network.load(Ordering::Relaxed)/elapsed});}
    }
}
pub fn hash(path:&Path, algorithm:&str)->Result<String>{
    use std::io::Read; let mut file=std::fs::File::open(path)?;let mut buf=[0u8;128*1024];
    enum Hasher {One(sha1::Sha1),Two(Sha256),Five(Sha512)}
    let mut h=match algorithm{"sha1"=>Hasher::One(sha1::Sha1::new()),"sha256"=>Hasher::Two(Sha256::new()),"sha512"=>Hasher::Five(Sha512::new()),_=>return Err(BackendError::new("hash","Unsupported hash algorithm"))};
    loop {let n=file.read(&mut buf)?;if n==0{break;}match &mut h{Hasher::One(h)=>h.update(&buf[..n]),Hasher::Two(h)=>h.update(&buf[..n]),Hasher::Five(h)=>h.update(&buf[..n])}}
    Ok(match h{Hasher::One(h)=>format!("{:x}",h.finalize()),Hasher::Two(h)=>format!("{:x}",h.finalize()),Hasher::Five(h)=>format!("{:x}",h.finalize())})
}
pub async fn valid(file:&Artifact)->Result<bool>{
    let metadata=match tokio::fs::metadata(&file.path).await{Ok(m)=>m,Err(_)=>return Ok(false)};
    if file.size.is_some_and(|s|metadata.len()!=s){return Ok(false);}
    let Some(expected)=file.hash.clone()else{return Ok(false)};let path=file.path.clone();let algorithm=file.algorithm;
    let actual=tokio::task::spawn_blocking(move||hash(&path,algorithm)).await.map_err(|e|BackendError::new("hash",e.to_string()))??;
    Ok(actual.eq_ignore_ascii_case(&expected))
}
pub async fn file(backend:&Backend,item:&Artifact,job:&Job,stage:&str)->Result<()> {
    job.check()?;
    if valid(item).await? {job.downloaded.fetch_add(item.size.unwrap_or(std::fs::metadata(&item.path)?.len()),Ordering::Relaxed);job.completed.fetch_add(1,Ordering::Relaxed);job.emit(stage,"running",&item.path.file_name().unwrap_or_default().to_string_lossy());return Ok(());}
    let parsed=reqwest::Url::parse(&item.url).map_err(|_|BackendError::new("download","Invalid download URL"))?;
    if parsed.scheme()!="https"{return Err(BackendError::new("download","Download source must use HTTPS"));}
    tokio::fs::create_dir_all(item.path.parent().unwrap()).await?;
    let partial=item.path.with_extension(format!("{}.part",uuid::Uuid::new_v4()));
    let mut last=BackendError::new("download","Download failed");
    for attempt in 0..3 {
        job.check()?;let mut received=0u64;
        let result:Result<()>=async {
            let request=backend.client.get(parsed.clone()).send();tokio::pin!(request);
            let mut response=loop{tokio::select!{result=&mut request=>break result?,_=tokio::time::sleep(std::time::Duration::from_millis(250))=>{job.check()?;}}};
            if response.url().scheme()!="https"{return Err(BackendError::new("download","Insecure redirect rejected"));}
            if !response.status().is_success(){return Err(BackendError::new(&format!("http_{}",response.status().as_u16()),"Artifact download failed"));}
            let length=item.size.or(response.content_length());if length.is_some_and(|size|fs2::available_space(item.path.parent().unwrap()).is_ok_and(|free|free<size)){return Err(BackendError::new("disk_space","Insufficient free space for this download"));}let mut output=tokio::fs::File::create(&partial).await?;let mut tick=Instant::now();
            loop {
                let chunk=tokio::select!{result=response.chunk()=>result?,_=tokio::time::sleep(std::time::Duration::from_millis(250))=>{job.check()?;continue;}};
                let Some(chunk)=chunk else{break;};
                job.check()?;if length.is_some_and(|limit|received.saturating_add(chunk.len() as u64)>limit){return Err(BackendError::new("checksum","Download exceeds the declared file size"));}output.write_all(&chunk).await?;received+=chunk.len() as u64;job.network.fetch_add(chunk.len() as u64,Ordering::Relaxed);job.downloaded.fetch_add(chunk.len() as u64,Ordering::Relaxed);
                if tick.elapsed().as_millis()>120 {job.emit(stage,"running",&item.path.file_name().unwrap_or_default().to_string_lossy());tick=Instant::now();}
            }
            output.sync_all().await?;drop(output);
            if length.is_some_and(|s|s!=received){return Err(BackendError::new("checksum","Downloaded length does not match metadata"));}
            if let Some(expected)=&item.hash {let path=partial.clone();let algorithm=item.algorithm;let actual=tokio::task::spawn_blocking(move||hash(&path,algorithm)).await.map_err(|e|BackendError::new("hash",e.to_string()))??;if !actual.eq_ignore_ascii_case(expected){return Err(BackendError::new("checksum","Artifact checksum mismatch"));}}
            job.check()?;super::storage::replace(&partial,&item.path)?;Ok(())
        }.await;
        match result {Ok(())=>{job.completed.fetch_add(1,Ordering::Relaxed);job.emit(stage,"running",&item.path.file_name().unwrap_or_default().to_string_lossy());return Ok(())},Err(e)=>{job.downloaded.fetch_sub(received,Ordering::Relaxed);let _=tokio::fs::remove_file(&partial).await;last=e;if !last.retryable && last.code!="checksum"{break;}if attempt<2{tokio::time::sleep(std::time::Duration::from_secs(1<<attempt)).await;}}}
    }Err(last)
}
pub async fn batch(backend:Arc<Backend>,items:Vec<Artifact>,job:Arc<Job>,stage:&'static str)->Result<()> {
    job.files.store(items.len() as u64,Ordering::Relaxed);job.total.store(if items.iter().all(|i|i.size.is_some()){items.iter().filter_map(|i|i.size).sum()}else{0},Ordering::Relaxed);job.downloaded.store(0,Ordering::Relaxed);job.completed.store(0,Ordering::Relaxed);
    let mut tasks=tokio::task::JoinSet::new();let limit=backend.settings().concurrency.clamp(1,8);
    let mut iter=items.into_iter();let mut exhausted=false;
    loop {
        while tasks.len()<limit&&!exhausted {if let Some(item)=iter.next(){let b=backend.clone();let j=job.clone();tasks.spawn(async move{file(&b,&item,&j,stage).await});}else{exhausted=true;}}
        let Some(result)=tasks.join_next().await else {break};
        if let Err(error)=result.map_err(|e|BackendError::new("download",e.to_string()))? {job.cancel.store(true,Ordering::Relaxed);while tasks.join_next().await.is_some(){}return Err(error);}
    }Ok(())
}
pub async fn json(backend:&Backend,url:&str)->Result<serde_json::Value>{
    let response=backend.client.get(url).send().await?;if !response.status().is_success(){return Err(BackendError::new(&format!("http_{}",response.status().as_u16()),"Metadata request failed"));}Ok(response.json().await?)
}
pub async fn cancellable<T>(job:&Job,future:impl std::future::Future<Output=Result<T>>)->Result<T>{
    tokio::pin!(future);job.check()?;
    loop{tokio::select!{result=&mut future=>return result,_=tokio::time::sleep(std::time::Duration::from_millis(150))=>{job.check()?;}}}
}
#[cfg(test)]mod tests {use super::*;#[test]fn streaming_hash(){let path=std::env::temp_dir().join(format!("canary-hash-{}",uuid::Uuid::new_v4()));std::fs::write(&path,b"abc").unwrap();assert_eq!(hash(&path,"sha256").unwrap(),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");std::fs::remove_file(path).unwrap();}}
