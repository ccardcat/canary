//! Instance preparation is invisible to Library until its directory is committed.
use super::{Backend, download::Job, model::*, storage};
use std::{path::{Path,PathBuf},sync::Arc,io::{Read,Write}};
pub struct InstanceStage {b:Arc<Backend>,id:String,pub path:PathBuf,pub parent:PathBuf,target:PathBuf,preserve:bool}
fn copy(source:&Path,target:&Path,job:&Job)->Result<()> {
    job.check()?;std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {job.check()?;let entry=entry?;let kind=entry.file_type()?;if kind.is_symlink(){return Err(BackendError::new("unsafe_path","Instance contains a symbolic link"));}let dest=target.join(entry.file_name());if kind.is_dir(){copy(&entry.path(),&dest,job)?;}else if kind.is_file(){let mut from=std::fs::File::open(entry.path())?;let mut to=std::fs::File::create(dest)?;let mut buf=[0u8;128*1024];loop{job.check()?;let n=from.read(&mut buf)?;if n==0{break;}to.write_all(&buf[..n])?;}}}Ok(())
}
impl InstanceStage {
    pub fn new(b:Arc<Backend>,id:&str)->Result<Self> {
        let target=b.instance_path(id)?;let root=target.parent().ok_or_else(||BackendError::new("storage","Missing instance root"))?;
        let parent=root.join(format!(".activity-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&parent)?;
        storage::write_json(&parent.join("transaction.json"),&serde_json::json!({"id":id}))?;
        let path=parent.join(id);b.staged.lock().unwrap().insert(id.into(),path.clone());Ok(Self{b,id:id.into(),path,parent,target,preserve:false})
    }
    pub async fn copy_existing(&self,job:Arc<Job>)->Result<()> {
        let from=self.target.clone();let to=self.path.clone();job.emit("staging","running","");
        tokio::task::spawn_blocking(move||copy(&from,&to,&job)).await.map_err(|e|BackendError::new("staging",e.to_string()))?
    }
    pub fn commit(&mut self,job:&Job)->Result<Instance> {
        job.critical()?;
        // runtime receipts include native paths inside the instance; rebase before rename.
        fn rebase(value:&mut serde_json::Value,from:&str,to:&str){match value{serde_json::Value::String(s)=>{*s=s.replace(from,to);},serde_json::Value::Array(a)=>for v in a{rebase(v,from,to)},serde_json::Value::Object(o)=>for v in o.values_mut(){rebase(v,from,to)},_=>{}}}
        for name in ["runtime.json","loader.json","instance.json","canary-instance.json"]{let path=self.path.join(name);if path.is_file(){let mut value:serde_json::Value=serde_json::from_slice(&std::fs::read(&path)?)?;rebase(&mut value,&self.path.to_string_lossy(),&self.target.to_string_lossy());storage::write_json(&path,&value)?;}}
        let mut instance=storage::instance_from_dir(&self.path,&self.id)?;instance.status="ready".into();instance.error=None;instance.directory=self.target.to_string_lossy().into();storage::write_json(&self.path.join("instance.json"),&instance)?;
        let previous=self.parent.join("previous");let existed=self.target.exists();if existed{std::fs::rename(&self.target,&previous)?;}
        if let Err(e)=std::fs::rename(&self.path,&self.target){if existed&&std::fs::rename(&previous,&self.target).is_err(){self.preserve=true;}return Err(e.into());}
        self.b.staged.lock().unwrap().remove(&self.id);
        let old_catalog=self.b.store.lock().unwrap().instance_catalog.clone();
        if let Err(e)=self.b.save_instance(&instance){
            let moved=std::fs::rename(&self.target,&self.path).is_ok();if !moved||existed&&std::fs::rename(&previous,&self.target).is_err(){self.preserve=true;return Err(BackendError::new("rollback",format!("Commit failed; preserved recovery directory {}",self.parent.display())));}
            self.b.store.lock().unwrap().instance_catalog=old_catalog;let _=self.b.persist();return Err(e);
        }
        if existed {if let Err(e)=std::fs::remove_dir_all(&previous){self.preserve=true;eprintln!("[task][cleanup] preserved backup: {e}");}}
        Ok(instance)
    }
    pub fn cleanup(&mut self)->Result<()> {self.b.staged.lock().unwrap().remove(&self.id);if !self.preserve&&self.parent.exists(){std::fs::remove_dir_all(&self.parent)?;}Ok(())}
}
impl Drop for InstanceStage {fn drop(&mut self){let _=self.cleanup();}}
/// Recover interrupted directory swaps before reading Library. Only our journaled directories.
pub fn recover(root:&Path)->Result<()> {
    if !root.is_dir(){return Ok(());}for entry in std::fs::read_dir(root)? {let entry=entry?;if !entry.file_type()?.is_dir()||!entry.file_name().to_string_lossy().starts_with(".activity-"){continue;}let parent=entry.path();let journal=parent.join("transaction.json");if !journal.is_file(){continue;}let value:serde_json::Value=serde_json::from_slice(&std::fs::read(journal)?)?;let id=value["id"].as_str().ok_or_else(||BackendError::new("storage","Invalid transaction journal"))?;let target=storage::safe_join(root,id)?;let previous=parent.join("previous");if previous.exists()&&!target.exists(){std::fs::rename(previous,target)?;}std::fs::remove_dir_all(parent)?;}Ok(())
}
#[cfg(test)]mod tests {
    use super::*;use std::sync::atomic::AtomicBool;
    fn setup()->(Arc<Backend>,storage::Staging){let root=std::env::temp_dir().join(format!("canary-transaction-{}",uuid::Uuid::new_v4()));let cleanup=storage::Staging(root.clone());(Arc::new(Backend::with_root(root).unwrap()),cleanup)}
    #[test]fn new_failure_is_invisible_and_retry_commits(){let(b,_clean)=setup();let job=Job::new("test",None,Arc::new(AtomicBool::new(false)));for cancel in [true,false]{let mut stage=InstanceStage::new(b.clone(),"new").unwrap();std::fs::create_dir_all(&stage.path).unwrap();b.save_instance(&Instance{id:"new".into(),name:"New".into(),..Instance::default()}).unwrap();assert!(b.instances().unwrap().is_empty());if cancel{stage.cleanup().unwrap();assert!(!b.instance_path("new").unwrap().exists());}else{stage.commit(&job).unwrap();stage.cleanup().unwrap();assert_eq!(b.instances().unwrap().len(),1);}}}
    #[tokio::test]async fn cancelled_repair_preserves_metadata_worlds_and_files(){let(b,_clean)=setup();let dir=b.instance_path("old").unwrap();std::fs::create_dir_all(dir.join("saves/World")).unwrap();std::fs::write(dir.join("saves/World/level.dat"),b"world").unwrap();std::fs::write(dir.join("config.txt"),b"user").unwrap();b.save_instance(&Instance{id:"old".into(),name:"Old".into(),status:"ready".into(),..Instance::default()}).unwrap();let token=Arc::new(AtomicBool::new(false));let job=Arc::new(Job::new("test",None,token.clone()));let mut stage=InstanceStage::new(b.clone(),"old").unwrap();stage.copy_existing(job.clone()).await.unwrap();std::fs::write(stage.path.join("config.txt"),b"changed").unwrap();token.store(true,std::sync::atomic::Ordering::Release);assert_eq!(stage.commit(&job).err().unwrap().code,"cancelled");stage.cleanup().unwrap();assert_eq!(std::fs::read(dir.join("config.txt")).unwrap(),b"user");assert_eq!(std::fs::read(dir.join("saves/World/level.dat")).unwrap(),b"world");assert_eq!(b.instance("old").unwrap().status,"ready");}
    #[test]fn restart_restores_previous_directory_after_interrupted_swap(){
        let(b,_clean)=setup();let target=b.instance_path("old").unwrap();std::fs::create_dir_all(&target).unwrap();std::fs::write(target.join("world.dat"),b"original").unwrap();
        let mut stage=InstanceStage::new(b.clone(),"old").unwrap();std::fs::create_dir_all(&stage.path).unwrap();std::fs::write(stage.path.join("world.dat"),b"unfinished").unwrap();std::fs::rename(&target,stage.parent.join("previous")).unwrap();stage.preserve=true;stage.cleanup().unwrap();drop(stage);
        recover(&b.instances_root()).unwrap();assert_eq!(std::fs::read(target.join("world.dat")).unwrap(),b"original");assert_eq!(std::fs::read_dir(b.instances_root()).unwrap().count(),1);
    }

}
