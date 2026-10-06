//! Semantic activity independent of instance locks and provider requests.
use super::{download::Job, model::*, Backend};
use std::{collections::HashMap, sync::{Arc, atomic::{AtomicBool, Ordering}}};
use tauri::{AppHandle, Emitter};
#[derive(Clone,Copy,Debug,PartialEq,Eq,serde::Serialize)]
#[serde(rename_all="lowercase")]
pub enum TaskStatus {Running,Cancelling,Completed,Cancelled,Failed}
#[derive(Clone,Copy,serde::Serialize)]
#[serde(rename_all="lowercase")]
pub enum TaskKind {Download,Install,Update,Repair,Launch}
impl TaskKind {fn parse(kind:&str)->Result<Self>{match kind{"download"=>Ok(Self::Download),"install"=>Ok(Self::Install),"update"=>Ok(Self::Update),"repair"=>Ok(Self::Repair),"launch"=>Ok(Self::Launch),_=>Err(BackendError::new("task","Unknown task kind"))}}}
#[derive(Clone, serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct Task {
    pub revision:u64, pub id:String, pub operation_id:String, pub kind:TaskKind, pub title:String,
    pub instance_id:Option<String>, pub status:TaskStatus, pub stage:String,
    pub started_at:u64, pub updated_at:u64, pub cancellable:bool, pub cancel_requested:bool,
    pub completed:u64, pub total:u64, pub downloaded:u64, pub bytes_total:u64,
    pub percent:f64, pub speed:u64, pub current_file:String, pub error:Option<BackendError>,
}
pub struct Record {pub task:Task,pub cancel:Arc<AtomicBool>}
pub type Registry=std::sync::Mutex<HashMap<String,Record>>;
pub fn terminal(status:&TaskStatus)->bool {matches!(status,TaskStatus::Completed|TaskStatus::Cancelled|TaskStatus::Failed)}
impl Job {
    pub fn tracked(b:Arc<Backend>,operation:&str,kind:&str,title:&str,instance:Option<&str>,app:Option<AppHandle>,cancel:Arc<AtomicBool>,task_id:Option<String>)->Result<Arc<Self>> {
        let id=task_id.unwrap_or_else(||uuid::Uuid::new_v4().to_string());
        uuid::Uuid::parse_str(&id).map_err(|_|BackendError::new("task","Invalid task ID"))?;
        let task=Task{revision:1,id:id.clone(),operation_id:operation.into(),kind:TaskKind::parse(kind)?,title:title.into(),instance_id:instance.map(str::to_owned),status:TaskStatus::Running,stage:"preparing".into(),started_at:now(),updated_at:now(),cancellable:true,cancel_requested:false,completed:0,total:0,downloaded:0,bytes_total:0,percent:0.,speed:0,current_file:String::new(),error:None};
        {let mut records=b.tasks.lock().unwrap();if records.contains_key(&id){return Err(BackendError::new("task","Task ID already used"));}if records.len()>200 {let mut recent=records.values().filter(|r|terminal(&r.task.status)).map(|r|(r.task.updated_at,r.task.id.clone())).collect::<Vec<_>>();recent.sort();for (_,id) in recent.into_iter().take(100){records.remove(&id);}}records.insert(id.clone(),Record{task:task.clone(),cancel:cancel.clone()});}
        let mut job=Job::new(&id,app.clone(),cancel);job.activity=Some(b);if let Some(b)=&job.activity{b.discord.changed();}if let Some(app)=app{let _=app.emit("activity-task",task);}Ok(Arc::new(job))
    }
    pub fn title(&self,title:&str) {
        let Some(b)=&self.activity else{return};let task={let mut records=b.tasks.lock().unwrap();let Some(record)=records.get_mut(&self.id)else{return};if terminal(&record.task.status){return;}record.task.title=title.chars().take(256).collect();record.task.revision+=1;record.task.clone()};if let Some(app)=&self.app{let _=app.emit("activity-task",task);}
    }
    pub fn activity_progress(&self,stage:&str,file:&str,force:bool) {
        let Some(b)=&self.activity else{return};
        {let mut tick=self.activity_tick.lock().unwrap();if !force&&tick.0==stage&&tick.1.elapsed().as_millis()<120{return;}*tick=(stage.into(),std::time::Instant::now());}
        let task={let mut records=b.tasks.lock().unwrap();let Some(record)=records.get_mut(&self.id)else{return};if terminal(&record.task.status){return;}let t=&mut record.task;t.revision+=1;t.stage=stage.into();t.updated_at=now();t.completed=self.completed.load(Ordering::Relaxed);t.total=self.files.load(Ordering::Relaxed);t.downloaded=self.downloaded.load(Ordering::Relaxed);t.bytes_total=self.total.load(Ordering::Relaxed);t.percent=if t.bytes_total>0{(t.downloaded as f64/t.bytes_total as f64*100.).clamp(0.,100.)}else if t.total>0{(t.completed as f64/t.total as f64*100.).clamp(0.,100.)}else{0.};t.speed=self.network.load(Ordering::Relaxed)/self.elapsed().as_secs().max(1);t.current_file=file.into();t.clone()};
        if let Some(app)=&self.app{let _=app.emit("activity-task",task);}
    }
    /// A cancel and entry into commit share the registry lock: exactly one wins.
    pub fn critical(&self)->Result<()> {
        if let Some(b)=&self.activity {let task={let mut records=b.tasks.lock().unwrap();self.check()?;let record=records.get_mut(&self.id).ok_or_else(||BackendError::new("task","Task is missing"))?;record.task.revision+=1;record.task.cancellable=false;record.task.stage="finalize".into();record.task.clone()};if let Some(app)=&self.app{let _=app.emit("activity-task",task);}}
        else {self.check()?;}Ok(())
    }
    pub fn finish<T>(&self,result:&Result<T>) {
        let Some(b)=&self.activity else{return};let task={let mut records=b.tasks.lock().unwrap();let Some(record)=records.get_mut(&self.id)else{return};if terminal(&record.task.status){return;}let t=&mut record.task;t.revision+=1;t.status=match result{Ok(_)=>TaskStatus::Completed,Err(e) if e.code=="cancelled"=>TaskStatus::Cancelled,Err(_)=>TaskStatus::Failed};t.error=result.as_ref().err().cloned();t.cancellable=false;t.updated_at=now();t.current_file.clear();t.speed=0;if result.is_ok(){t.percent=100.;}t.clone()};
        b.discord.changed();
        eprintln!("[task][{}][{}] {}",task.id,task.stage,format!("{:?}",task.status));
        if let Some(app)=&self.app{let _=app.emit("activity-task",task);let _=app.emit("instances-changed",());}
    }
}
pub fn cancel(b:&Backend,id:&str,app:Option<&AppHandle>)->Result<bool> {
    let task={let mut records=b.tasks.lock().unwrap();let Some(record)=records.get_mut(id)else{return Ok(false)};if terminal(&record.task.status){return Ok(true);}if !record.task.cancellable{return Err(BackendError::new("finalizing","The operation is finishing safely"));}record.task.revision+=1;record.cancel.store(true,Ordering::Release);record.task.cancel_requested=true;record.task.status=TaskStatus::Cancelling;record.task.clone()};
    b.discord.changed();if let Some(app)=app{let _=app.emit("activity-task",task);}Ok(true)
}
#[cfg(test)]mod tests {
    use super::*;
    #[test]fn terminal_events_and_commit_cancel_race(){let root=std::env::temp_dir().join(format!("canary-activity-{}",uuid::Uuid::new_v4()));let _cleanup=super::super::storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root).unwrap());let job=Job::tracked(b.clone(),"instance","install","Pack",None,None,Arc::new(AtomicBool::new(false)),None).unwrap();job.critical().unwrap();assert_eq!(cancel(&b,&job.id,None).unwrap_err().code,"finalizing");job.finish(&Err::<(),_>(BackendError::new("network","offline")));job.emit("downloads","running","late.jar");let records=b.tasks.lock().unwrap();let task=&records[&job.id].task;assert_eq!(task.status,TaskStatus::Failed);assert!(task.current_file.is_empty());}
    #[test]fn cancel_wins_before_commit(){let root=std::env::temp_dir().join(format!("canary-activity-{}",uuid::Uuid::new_v4()));let _cleanup=super::super::storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root).unwrap());let job=Job::tracked(b.clone(),"instance","repair","Pack",None,None,Arc::new(AtomicBool::new(false)),None).unwrap();cancel(&b,&job.id,None).unwrap();assert_eq!(job.critical().unwrap_err().code,"cancelled");assert_eq!(b.tasks.lock().unwrap()[&job.id].task.status,TaskStatus::Cancelling);job.finish(&Err::<(),_>(BackendError::new("cancelled","Cancelled")));assert_eq!(b.tasks.lock().unwrap()[&job.id].task.status,TaskStatus::Cancelled);}
}
