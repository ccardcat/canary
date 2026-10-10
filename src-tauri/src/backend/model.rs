use serde::{Deserialize, Serialize};
pub type Result<T> = std::result::Result<T, BackendError>;
#[derive(Debug, Clone, Serialize)]
pub struct BackendError { pub code: String, pub stage: String, pub message: String, pub retryable: bool, #[serde(skip_serializing_if="Option::is_none")] pub context: Option<serde_json::Value> }
impl BackendError {
    pub fn new(code: &str, message: impl Into<String>) -> Self { Self { code: code.into(), stage: code.into(), message: super::privacy::diagnostic(&message.into()), retryable: matches!(code, "network"|"download"|"cancelled"|"timeout"|"http_429"|"http_500"|"http_502"|"http_503"|"http_504"), context: None } }
}
impl std::fmt::Display for BackendError { fn fmt(&self, f:&mut std::fmt::Formatter<'_>) -> std::fmt::Result { write!(f,"[{}] {}",self.code,self.message) } }
impl std::error::Error for BackendError {}
impl From<std::io::Error> for BackendError { fn from(e:std::io::Error)->Self { Self::new(if e.kind()==std::io::ErrorKind::PermissionDenied {"permission"}else{"filesystem"},e.to_string()) } }
impl From<serde_json::Error> for BackendError { fn from(e:serde_json::Error)->Self { Self::new("metadata",e.to_string()) } }
impl From<reqwest::Error> for BackendError { fn from(e:reqwest::Error)->Self { Self::new(if e.is_timeout(){"timeout"}else{"network"},e.without_url().to_string()) } }
pub fn now() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() }
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub instances_path: Option<String>, pub backup_before_changes:bool, pub backup_retention:usize, pub log_retention_days:u32, pub update_checks:bool,
    pub automatic_java: bool, pub java_path: Option<String>, pub memory_mode:String, pub min_memory: u32, pub max_memory: u32,
    pub jvm_args: Vec<String>, pub game_args: Vec<String>, pub width: u32, pub height: u32,
    pub fullscreen: bool, pub concurrency: usize, pub snapshots: bool, pub active_account: Option<String>,
}
impl Default for Settings { fn default()->Self {Self {instances_path:None,backup_before_changes:true,backup_retention:8,log_retention_days:30,update_checks:true,automatic_java:true,java_path:None,memory_mode:"manual".into(),min_memory:512,max_memory:4096,jvm_args:vec![],game_args:vec![],width:1280,height:720,fullscreen:false,concurrency:4,snapshots:false,active_account:None}} }
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Overrides {pub memory_mode:Option<String>,pub java:Option<String>,pub min_memory:Option<u32>,pub max_memory:Option<u32>,pub jvm_args:Option<Vec<String>>,pub game_args:Option<Vec<String>>,pub width:Option<u32>,pub height:Option<u32>,pub fullscreen:Option<bool>,pub account:Option<String>}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Instance {
    pub last_server:Option<LastServer>,
    pub internal:bool, pub schema:u32, pub id:String, pub name:String, pub provider:String, pub project_id:Option<String>,pub version_id:Option<String>,pub version_name:String,
    pub minecraft:String,pub loader:String,pub loader_version:Option<String>, pub directory:String,pub icon:Option<String>, pub installed:u64,
    pub last_played:Option<u64>,pub playtime:u64,pub favorite:bool,pub status:String,pub update_available:bool,pub error:Option<BackendErrorData>,pub overrides:Overrides,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct BackendErrorData {pub code:String,pub message:String}
#[derive(Clone, Serialize, Deserialize)]
pub struct LastServer {pub address:String,pub joined_at:u64}
impl Default for Instance {fn default()->Self { Self {last_server:None,internal:false,schema:1,id:String::new(),name:String::new(),provider:"custom".into(),project_id:None,version_id:None,version_name:String::new(),minecraft:String::new(),loader:"vanilla".into(),loader_version:None,directory:String::new(),icon:None,installed:now(),last_played:None,playtime:0,favorite:false,status:"installed".into(),update_available:false,error:None,overrides:Overrides::default()} }}
#[derive(Clone, Serialize, Deserialize)]
pub struct Account {pub id:String,pub provider:String,pub uuid:String,pub username:String,pub avatar:Option<String>,pub status:String,pub last_used:Option<u64>,pub credential_ref:Option<String>}
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Store {pub trusted_java:std::collections::HashMap<String,String>,pub trusted_jvm:Vec<String>,pub removed_accounts:Vec<String>,pub instance_roots:Vec<String>,pub instance_catalog:Vec<Instance>,pub schema:u32,pub settings:Settings,pub accounts:Vec<Account>,pub activity:Vec<Activity>}
#[derive(Clone, Serialize, Deserialize)]
pub struct Activity {#[serde(default="activity_id")]pub id:String,pub timestamp:u64,pub instance:Option<String>,pub kind:String,pub message:String}
#[derive(Clone, Serialize)]
pub struct Event {pub id:String,pub stage:String,pub status:String,pub file:String,pub completed:u64,pub total:u64,pub downloaded:u64,pub bytes_total:u64,pub percent:f64,pub speed:u64}
#[derive(Clone, Serialize, Deserialize)]
pub struct JavaRuntime {pub path:String,pub version:String,pub major:u32,pub architecture:String,pub vendor:String,pub managed:bool}

fn activity_id()->String {uuid::Uuid::new_v4().to_string()}
