pub mod activity;
pub mod game_logs;
pub mod discord;
pub mod transaction;
pub mod elyby;
pub mod microsoft;
#[cfg(target_os="linux")]mod client_window;
pub mod content;
pub mod content_compatibility;
pub mod mod_failure;
pub mod content_provider;
pub mod pack_update;
pub mod accounts;
pub mod account_resources;
pub mod artwork;
pub mod wallpapers;
pub mod commands;
pub mod curseforge;
pub mod curseforge_content;
pub mod download;
pub mod network;
pub mod protected_fs;
pub mod privacy;
pub mod java;
pub mod launch_arguments;
pub mod loaders;
pub mod loader_catalog;
pub mod server_history;
pub mod minecraft;
pub mod modpacks;
pub mod mrpack_import;
pub mod model;
pub mod process;
pub mod storage;
pub mod storage_settings;
pub mod system;
pub mod memory;

use std::{collections::HashMap, sync::{Arc, Mutex, atomic::AtomicBool}};
use model::{BackendError, Result};
/// Opt-in startup stages for desktop CI. Never record accounts or settings.
pub fn startup_phase(stage:&str) {
    if let Some(path)=std::env::var_os("CANARY_STARTUP_LOG") {
        use std::io::Write;
        if let Ok(mut file)=protected_fs::append(path) {
            let _=writeln!(file,"{} {stage}",model::now());
        }
    }
}
pub struct Backend {
    pub root: std::path::PathBuf,
    pub discord: Arc<discord::Manager>,
    pub tasks:activity::Registry,
    pub staged:Mutex<HashMap<String,std::path::PathBuf>>,
    pub maintenance:AtomicBool,
    pub wallpaper_lock:Mutex<()>,
    pub auth:tokio::sync::Mutex<()>,
    pub account_resources:account_resources::Registry,
    pub client: reqwest::Client,
    pub private_api_client:reqwest::Client,
    pub private_download_client:reqwest::Client,
    pub curseforge_health:tokio::sync::Mutex<Option<(std::time::Instant,bool)>>,
    pub server_history_checked:Mutex<std::collections::HashSet<String>>,
    pub store: Mutex<model::Store>,
    pub jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub provider_requests: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub processes: Mutex<HashMap<String, process::Running>>,
}
pub struct JobLease {pub backend:Arc<Backend>,pub id:String,pub cancel:Arc<AtomicBool>}
impl Drop for JobLease {fn drop(&mut self){self.backend.jobs.lock().unwrap().remove(&self.id);}}
impl Backend {
    pub fn new() -> Result<Self> {
        // Only inspector QA builds can redirect storage; production keeps its
        // normal per-user directory. Native security tests never touch real accounts.
        #[cfg(feature="native-qa")]
        if let Some(root)=std::env::var_os("CANARY_QA_DATA_ROOT") {return Self::with_root(root.into());}
        let root = dirs::data_local_dir().ok_or_else(|| BackendError::new("storage", "No application data directory"))?.join("Canary");
        Self::with_root(root)
    }
    pub fn with_root(root:std::path::PathBuf)->Result<Self>{
        startup_phase("storage initialization");
        for folder in ["instances", "cache", "logs", "java", "temp"] { crate::backend::protected_fs::create_dir_all(root.join(folder))?; }
        let store = storage::load(&root)?;
        startup_phase("storage loaded");
        transaction::recover(&root.join("instances"))?;
        if let Some(path)=&store.settings.instances_path{transaction::recover(std::path::Path::new(path))?;}
        for path in &store.instance_roots {transaction::recover(std::path::Path::new(path))?;}
        startup_phase("HTTP client initialization");
        Ok(Self { root,server_history_checked:Mutex::new(std::collections::HashSet::new()),curseforge_health:tokio::sync::Mutex::new(None),discord:Arc::new(discord::Manager::default()),tasks:Mutex::new(HashMap::new()),staged:Mutex::new(HashMap::new()),wallpaper_lock:Mutex::new(()),maintenance:AtomicBool::new(false),auth:tokio::sync::Mutex::new(()),account_resources:Mutex::new(HashMap::new()), store: Mutex::new(store), jobs: Mutex::new(HashMap::new()), provider_requests:Mutex::new(HashMap::new()), processes: Mutex::new(HashMap::new()),
            private_api_client:network::client_builder().user_agent(concat!("Canary/",env!("CARGO_PKG_VERSION"))).redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(30)).build()?,
            private_download_client:network::client_builder().user_agent(concat!("Canary/",env!("CARGO_PKG_VERSION"))).redirect(reqwest::redirect::Policy::none()).connect_timeout(std::time::Duration::from_secs(20)).timeout(std::time::Duration::from_secs(300)).build()?,
            client: network::client_builder().user_agent(concat!("Canary/",env!("CARGO_PKG_VERSION")," (https://github.com/ccardcat/canary)"))
                .connect_timeout(std::time::Duration::from_secs(20)).timeout(std::time::Duration::from_secs(300)).build()? })
    }
    pub fn record_activity(&self,kind:&str,message:&str,instance:Option<&str>)->Result<()>{
        {let mut store=self.store.lock().unwrap();store.activity.push(model::Activity{id:uuid::Uuid::new_v4().to_string(),timestamp:model::now(),instance:instance.map(str::to_owned),kind:kind.into(),message:message.into()});store.activity.retain(|a|a.kind!="ready"&&a.timestamp>=model::now().saturating_sub(30*86400));let excess=store.activity.len().saturating_sub(300);store.activity.drain(..excess);}
        self.persist()
    }
    pub fn settings(&self) -> model::Settings { self.store.lock().unwrap().settings.clone() }
    pub fn persist(&self) -> Result<()> { storage::write_json(&self.root.join("settings.json"), &*self.store.lock().unwrap()) }
    pub fn instances_root(&self)->std::path::PathBuf {self.settings().instances_path.filter(|p|!p.is_empty()).map(std::path::PathBuf::from).unwrap_or_else(||self.root.join("instances"))}
    pub fn instance_roots(&self)->Vec<std::path::PathBuf> {let store=self.store.lock().unwrap();let default=self.root.join("instances");let active=store.settings.instances_path.as_ref().map(std::path::PathBuf::from).unwrap_or(default.clone());let mut roots=vec![active];for path in &store.instance_roots{let p=std::path::PathBuf::from(path);if !roots.contains(&p){roots.push(p);}}if store.instance_roots.is_empty()&&!roots.contains(&default){roots.push(default);}roots}
    pub fn instance_path(&self,id:&str)->Result<std::path::PathBuf> {
        storage::validate_instance_id(id)?;
        if let Some(path)=self.staged.lock().unwrap().get(id){return Ok(path.clone());}
        // Metadata paths are never accepted as authority: only registered roots + a safe ID.
        for root in self.instance_roots(){let path=storage::safe_join(&root,id)?;if path.join("instance.json").is_file()||path.join("canary-instance.json").is_file(){return Ok(path);}}
        if self.store.lock().unwrap().instance_catalog.iter().any(|i|i.id==id){return Err(BackendError::new("storage_unavailable","The drive containing this instance is unavailable. Reconnect it and retry."));}
        storage::safe_join(&self.instances_root(),id)
    }
    pub fn instance(&self,id:&str)->Result<model::Instance> {let mut value=storage::instance_from_dir(&self.instance_path(id)?,id)?;self.normalize_account(&mut value);Ok(value)}
    pub fn normalize_account(&self,value:&mut model::Instance){if value.overrides.account.as_ref().is_some_and(|id|self.store.lock().unwrap().removed_accounts.contains(id)){value.overrides.account=None;}}
    pub fn instances(&self)->Result<Vec<model::Instance>> {
        let mut out=vec![];let mut available=vec![];
        for root in self.instance_roots(){if !root.is_dir(){continue;}available.push(root.clone());for i in storage::instances_in(&root)?{if !out.iter().any(|v:&model::Instance|v.id==i.id){out.push(i);}}}
        {let mut store=self.store.lock().unwrap();for cached in &store.instance_catalog{if !out.iter().any(|i|i.id==cached.id)&&!available.iter().any(|r|std::path::Path::new(&cached.directory).parent()==Some(r.as_path())){let mut i=cached.clone();i.status="unavailable".into();i.error=Some(model::BackendErrorData{code:"storage_unavailable".into(),message:"Instance drive is unavailable".into()});out.push(i);}}for value in &mut out{if value.overrides.account.as_ref().is_some_and(|id|store.removed_accounts.contains(id)){value.overrides.account=None;}}if serde_json::to_value(&store.instance_catalog)?!=serde_json::to_value(&out)?{store.instance_catalog=out.clone();storage::write_json(&self.root.join("settings.json"),&*store)?;}}
        out.sort_by_key(|i|std::cmp::Reverse(i.installed));Ok(out)
    }
    pub fn save_instance(&self,value:&model::Instance)->Result<()> {
        let root=self.instance_path(&value.id)?;let mut value=value.clone();value.directory=root.to_string_lossy().into();
        let staged=self.staged.lock().unwrap().contains_key(&value.id);
        let mut store=self.store.lock().unwrap();
        if value.overrides.account.as_ref().is_some_and(|id|store.removed_accounts.contains(id)){value.overrides.account=None;}
        if let Some(latest)=store.instance_catalog.iter().find(|i|i.id==value.id).and_then(|i|i.last_server.as_ref()) {
            if value.last_server.as_ref().is_none_or(|s|s.joined_at<=latest.joined_at){value.last_server=Some(latest.clone());}
        }
        storage::write_json(&root.join("instance.json"),&value)?;
        if staged{return Ok(());}
        store.instance_catalog.retain(|i|i.id!=value.id);store.instance_catalog.push(value);
        storage::write_json(&self.root.join("settings.json"),&*store)
    }
    pub fn begin(&self, id: &str) -> Result<Arc<AtomicBool>> {
        let mut jobs = self.jobs.lock().unwrap();
        if self.maintenance.load(std::sync::atomic::Ordering::Acquire){return Err(BackendError::new("storage_in_use", "Storage maintenance is in progress"));}
        if jobs.contains_key(id) || self.processes.lock().unwrap().contains_key(id) { return Err(BackendError::new("instance_in_use", "This instance is already preparing or running")); }
        let cancel = Arc::new(AtomicBool::new(false)); jobs.insert(id.into(), cancel.clone()); Ok(cancel)
    }
    pub fn lease(self:&Arc<Self>,id:&str)->Result<JobLease>{Ok(JobLease{backend:self.clone(),id:id.into(),cancel:self.begin(id)?})}
}

#[cfg(test)] mod content_tests;

pub mod integrity;

#[cfg(test)] mod security_tests;
