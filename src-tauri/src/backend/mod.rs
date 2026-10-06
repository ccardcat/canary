pub mod activity;
pub mod transaction;
pub mod elyby;
pub mod microsoft;
#[cfg(target_os="linux")]mod client_window;
pub mod content;
pub mod content_provider;
pub mod pack_update;
pub mod accounts;
pub mod artwork;
pub mod wallpapers;
pub mod commands;
pub mod curseforge;
pub mod curseforge_content;
pub mod download;
pub mod java;
pub mod loaders;
pub mod minecraft;
pub mod modpacks;
pub mod mrpack_import;
pub mod model;
pub mod process;
pub mod storage;
pub mod storage_settings;
pub mod system;

use std::{collections::HashMap, sync::{Arc, Mutex, atomic::AtomicBool}};
use model::{BackendError, Result};
pub struct Backend {
    pub root: std::path::PathBuf,
    pub tasks:activity::Registry,
    pub staged:Mutex<HashMap<String,std::path::PathBuf>>,
    pub maintenance:AtomicBool,
    pub wallpaper_lock:Mutex<()>,
    pub auth:tokio::sync::Mutex<()>,
    pub client: reqwest::Client,
    pub private_api_client:reqwest::Client,
    pub store: Mutex<model::Store>,
    pub jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub provider_requests: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub processes: Mutex<HashMap<String, process::Running>>,
}
pub struct JobLease {pub backend:Arc<Backend>,pub id:String,pub cancel:Arc<AtomicBool>}
impl Drop for JobLease {fn drop(&mut self){self.backend.jobs.lock().unwrap().remove(&self.id);}}
impl Backend {
    pub fn new() -> Result<Self> {
        let root = dirs::data_local_dir().ok_or_else(|| BackendError::new("storage", "No application data directory"))?.join("Canary");
        Self::with_root(root)
    }
    pub fn with_root(root:std::path::PathBuf)->Result<Self>{
        for folder in ["instances", "cache", "logs", "java", "temp"] { std::fs::create_dir_all(root.join(folder))?; }
        let store = storage::load(&root)?;
        transaction::recover(&root.join("instances"))?;
        if let Some(path)=&store.settings.instances_path{transaction::recover(std::path::Path::new(path))?;}
        for path in &store.instance_roots {transaction::recover(std::path::Path::new(path))?;}
        Ok(Self { root,tasks:Mutex::new(HashMap::new()),staged:Mutex::new(HashMap::new()),wallpaper_lock:Mutex::new(()),maintenance:AtomicBool::new(false),auth:tokio::sync::Mutex::new(()), store: Mutex::new(store), jobs: Mutex::new(HashMap::new()), provider_requests:Mutex::new(HashMap::new()), processes: Mutex::new(HashMap::new()),
            private_api_client:reqwest::Client::builder().user_agent("Canary/0.1.0").redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(30)).build()?,
            client: reqwest::Client::builder().user_agent("Canary/0.1.0 (https://github.com/ccardcat/canary)")
                .connect_timeout(std::time::Duration::from_secs(20)).timeout(std::time::Duration::from_secs(300)).build()? })
    }
    pub fn settings(&self) -> model::Settings { self.store.lock().unwrap().settings.clone() }
    pub fn persist(&self) -> Result<()> { storage::write_json(&self.root.join("settings.json"), &*self.store.lock().unwrap()) }
    pub fn instances_root(&self)->std::path::PathBuf {self.settings().instances_path.filter(|p|!p.is_empty()).map(std::path::PathBuf::from).unwrap_or_else(||self.root.join("instances"))}
    pub fn instance_roots(&self)->Vec<std::path::PathBuf> {let store=self.store.lock().unwrap();let default=self.root.join("instances");let active=store.settings.instances_path.as_ref().map(std::path::PathBuf::from).unwrap_or(default.clone());let mut roots=vec![active];for path in &store.instance_roots{let p=std::path::PathBuf::from(path);if !roots.contains(&p){roots.push(p);}}if store.instance_roots.is_empty()&&!roots.contains(&default){roots.push(default);}roots}
    pub fn instance_path(&self,id:&str)->Result<std::path::PathBuf> {
        if let Some(path)=self.staged.lock().unwrap().get(id){return Ok(path.clone());}
        // Metadata paths are never accepted as authority: only registered roots + a safe ID.
        for root in self.instance_roots(){let path=storage::safe_join(&root,id)?;if path.join("instance.json").is_file()||path.join("canary-instance.json").is_file(){return Ok(path);}}
        if self.store.lock().unwrap().instance_catalog.iter().any(|i|i.id==id){return Err(BackendError::new("storage_unavailable","The drive containing this instance is unavailable. Reconnect it and retry."));}
        storage::safe_join(&self.instances_root(),id)
    }
    pub fn instance(&self,id:&str)->Result<model::Instance> {storage::instance_from_dir(&self.instance_path(id)?,id)}
    pub fn instances(&self)->Result<Vec<model::Instance>> {
        let mut out=vec![];let mut available=vec![];
        for root in self.instance_roots(){if !root.is_dir(){continue;}available.push(root.clone());for i in storage::instances_in(&root)?{if !out.iter().any(|v:&model::Instance|v.id==i.id){out.push(i);}}}
        {let mut store=self.store.lock().unwrap();for cached in &store.instance_catalog{if !out.iter().any(|i|i.id==cached.id)&&!available.iter().any(|r|std::path::Path::new(&cached.directory).parent()==Some(r.as_path())){let mut i=cached.clone();i.status="unavailable".into();i.error=Some(model::BackendErrorData{code:"storage_unavailable".into(),message:"Instance drive is unavailable".into()});out.push(i);}}store.instance_catalog=out.clone();}
        self.persist()?;out.sort_by_key(|i|std::cmp::Reverse(i.installed));Ok(out)
    }
    pub fn save_instance(&self,value:&model::Instance)->Result<()> {
        let root=self.instance_path(&value.id)?;let mut value=value.clone();value.directory=root.to_string_lossy().into();storage::write_json(&root.join("instance.json"),&value)?;
        if self.staged.lock().unwrap().contains_key(&value.id){return Ok(());}
        {let mut store=self.store.lock().unwrap();store.instance_catalog.retain(|i|i.id!=value.id);store.instance_catalog.push(value);}self.persist()
    }
    pub fn begin(&self, id: &str) -> Result<Arc<AtomicBool>> {
        let mut jobs = self.jobs.lock().unwrap();
        if self.maintenance.load(std::sync::atomic::Ordering::Acquire)||jobs.contains_key(id) || self.processes.lock().unwrap().contains_key(id) { return Err(BackendError::new("busy", "Instance is already preparing or running")); }
        let cancel = Arc::new(AtomicBool::new(false)); jobs.insert(id.into(), cancel.clone()); Ok(cancel)
    }
    pub fn lease(self:&Arc<Self>,id:&str)->Result<JobLease>{Ok(JobLease{backend:self.clone(),id:id.into(),cancel:self.begin(id)?})}
}

#[cfg(test)] mod content_tests;
