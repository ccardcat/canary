//! Bounded reads and verified paths. Game sessions contain game output only.
use super::{Backend,model::*,storage};
use std::{io::{Read,Seek,SeekFrom},path::PathBuf};
use tauri::{AppHandle,State};
use std::sync::Arc;
fn path(b:&Backend,id:&str,session:&str)->Result<PathBuf>{
    if !session.starts_with("canary-")||!session.ends_with(".log")||session.contains('/')||session.contains('\\'){return Err(BackendError::new("unsafe_path","Invalid game log session"));}
    storage::safe_join(&b.instance_path(id)?,&format!("logs/{session}"))
}
#[tauri::command]pub fn game_log_sessions(backend:State<'_,Arc<Backend>>)->Result<serde_json::Value>{
    let mut sessions=vec![];
    for instance in backend.instances()?{
        if instance.status=="unavailable"{continue;}
        let root=backend.instance_path(&instance.id)?;
        if let Ok(entries)=std::fs::read_dir(root.join("logs")){
            let mut files=entries.flatten().filter(|e|e.file_name().to_string_lossy().starts_with("canary-")&&e.path().extension().is_some_and(|x|x=="log")).collect::<Vec<_>>();files.sort_by_key(|e|e.file_name());
            let latest=files.last().map(|e|e.file_name());
            for file in files.iter().rev().take(20){
                let name=file.file_name();let timestamp=name.to_string_lossy().trim_start_matches("canary-").split(['-','.']).next().and_then(|n|n.parse::<u64>().ok()).unwrap_or(0);
                let state=if Some(&name)==latest.as_ref(){if backend.processes.lock().unwrap().contains_key(&instance.id){"playing"}else if instance.status=="crashed"{"crashed"}else{"finished"}}else{"finished"};
                let crash=if state=="crashed"{std::fs::read_dir(root.join("crash-reports")).ok().and_then(|entries|entries.flatten().filter(|e|e.path().extension().is_some_and(|x|x=="txt")).max_by_key(|e|e.file_name()).map(|e|e.file_name().to_string_lossy().to_string()))}else{None};
                sessions.push(serde_json::json!({"id":format!("{}:{}",instance.id,name.to_string_lossy()),"instanceId":instance.id,"file":name.to_string_lossy(),"title":instance.name,"minecraft":instance.minecraft,"startedAt":timestamp,"status":state,"crashReport":crash}));
            }
        }
    }
    sessions.sort_by_key(|s|std::cmp::Reverse(s["startedAt"].as_u64().unwrap_or(0)));sessions.truncate(100);Ok(serde_json::json!(sessions))
}
#[tauri::command]pub fn read_game_log(backend:State<'_,Arc<Backend>>,id:String,session:String)->Result<String>{
    let mut file=crate::backend::protected_fs::open(path(&backend,&id,&session)?)?;let size=file.metadata()?.len();let start=size.saturating_sub(2*1024*1024);file.seek(SeekFrom::Start(start))?;
    let mut bytes=vec![];file.take(2*1024*1024).read_to_end(&mut bytes)?;
    if start>0{if let Some(newline)=bytes.iter().position(|b|*b==b'\n'){bytes.drain(..=newline);}}
    Ok(super::privacy::diagnostic(&String::from_utf8_lossy(&bytes)))
}
#[tauri::command]pub fn open_game_log(backend:State<'_,Arc<Backend>>,app:AppHandle,id:String,session:String,crash:Option<bool>)->Result<()>{
    use tauri_plugin_opener::OpenerExt;
    let target=if crash.unwrap_or(false){if !session.ends_with(".txt")||session.contains('/')||session.contains('\\'){return Err(BackendError::new("unsafe_path","Invalid crash report"));}storage::safe_join(&backend.instance_path(&id)?,&format!("crash-reports/{session}"))?}else{path(&backend,&id,&session)?};
    if !target.is_file(){return Err(BackendError::new("filesystem","The log file is unavailable"));}
    app.opener().open_path(target.to_string_lossy(),None::<&str>).map_err(|e|BackendError::new("open_file",e.to_string()))
}
#[tauri::command]pub fn clear_activity(backend:State<'_,Arc<Backend>>)->Result<()>{backend.store.lock().unwrap().activity.clear();backend.persist()}
