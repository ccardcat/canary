pub mod elyby;
pub mod content;
pub mod content_provider;
pub mod pack_update;
pub mod accounts;
pub mod artwork;
pub mod commands;
pub mod curseforge;
pub mod download;
pub mod java;
pub mod loaders;
pub mod minecraft;
pub mod modpacks;
pub mod model;
pub mod process;
pub mod storage;
pub mod system;

use std::{collections::HashMap, sync::{Arc, Mutex, atomic::AtomicBool}};
use model::{BackendError, Result};
pub struct Backend {
    pub root: std::path::PathBuf,
    pub auth:tokio::sync::Mutex<()>,
    pub client: reqwest::Client,
    pub private_api_client:reqwest::Client,
    pub store: Mutex<model::Store>,
    pub jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
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
        Ok(Self { root, auth:tokio::sync::Mutex::new(()), store: Mutex::new(store), jobs: Mutex::new(HashMap::new()), processes: Mutex::new(HashMap::new()),
            private_api_client:reqwest::Client::builder().user_agent("Canary/0.1.0").redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(30)).build()?,
            client: reqwest::Client::builder().user_agent("Canary/0.1.0 (https://github.com/ccardcat/canary)")
                .connect_timeout(std::time::Duration::from_secs(20)).timeout(std::time::Duration::from_secs(300)).build()? })
    }
    pub fn settings(&self) -> model::Settings { self.store.lock().unwrap().settings.clone() }
    pub fn persist(&self) -> Result<()> { storage::write_json(&self.root.join("settings.json"), &*self.store.lock().unwrap()) }
    pub fn instance(&self, id: &str) -> Result<model::Instance> { storage::instance(&self.root, id) }
    pub fn save_instance(&self, value: &model::Instance) -> Result<()> {
        let root = storage::instance_dir(&self.root, &value.id)?;
        storage::write_json(&root.join("instance.json"), value)
    }
    pub fn begin(&self, id: &str) -> Result<Arc<AtomicBool>> {
        let mut jobs = self.jobs.lock().unwrap();
        if jobs.contains_key(id) || self.processes.lock().unwrap().contains_key(id) { return Err(BackendError::new("busy", "Instance is already preparing or running")); }
        let cancel = Arc::new(AtomicBool::new(false)); jobs.insert(id.into(), cancel.clone()); Ok(cancel)
    }
    pub fn lease(self:&Arc<Self>,id:&str)->Result<JobLease>{Ok(JobLease{backend:self.clone(),id:id.into(),cancel:self.begin(id)?})}
}

#[cfg(test)] mod content_tests;
