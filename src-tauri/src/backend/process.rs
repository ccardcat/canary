use super::{Backend,accounts,download::Job,java,minecraft,model::*,storage};
use std::{collections::HashMap,sync::Arc,process::Stdio};
use tauri::{AppHandle,Emitter};
use tokio::{io::{AsyncBufReadExt,BufReader},process::Child,sync::Mutex};
pub struct Running {pub pid:u32,pub account:String,pub child:Arc<Mutex<Child>>,pub stopping:Arc<std::sync::atomic::AtomicBool>}
pub async fn launch(backend:Arc<Backend>,mut instance:Instance,job:Arc<Job>,app:Option<AppHandle>)->Result<u32>{
    let account=accounts::selected(&backend,&instance)?;
    let identity=if account.provider=="elyby" { super::elyby::identity(&backend,&account).await? } else if account.provider=="microsoft" { super::microsoft::identity(&backend,&account).await? } else { accounts::launch_identity(&account)? };
    let secret=identity.access_token.clone();
    let prepared=minecraft::prepare(backend.clone(),&instance,job.clone(),false).await?;
    let java=java::select(backend.clone(),&instance,prepared.java_major,job.clone()).await?;
    let settings=backend.settings();let min=instance.overrides.min_memory.unwrap_or(settings.min_memory);let max=instance.overrides.max_memory.unwrap_or(settings.max_memory);
    super::system::validate_memory(min,max)?;
    let dir=backend.instance_path(&instance.id)?;
    let width=instance.overrides.width.unwrap_or(settings.width);let height=instance.overrides.height.unwrap_or(settings.height);
    let values=HashMap::from([
        ("auth_player_name".into(),identity.username),("auth_uuid".into(),identity.uuid),("auth_access_token".into(),identity.access_token.clone()),
        ("user_type".into(),identity.user_type),("user_properties".into(),"{}".into()),("auth_session".into(),identity.access_token),
        ("version_name".into(),prepared.metadata["id"].as_str().unwrap_or(&instance.minecraft).into()),("version_type".into(),prepared.metadata["type"].as_str().unwrap_or("release").into()),
        ("game_directory".into(),dir.to_string_lossy().into()),("assets_root".into(),prepared.assets.clone()),("assets_index_name".into(),prepared.asset_index.clone()),
        ("game_assets".into(),format!("{}/virtual/{}",prepared.assets,prepared.asset_index)),("natives_directory".into(),prepared.natives.clone()),
        ("launcher_name".into(),"Canary".into()),("launcher_version".into(),env!("CARGO_PKG_VERSION").into()),("classpath".into(),prepared.classpath.join(if cfg!(windows){";"}else{":"})),
        ("classpath_separator".into(),if cfg!(windows){";"}else{":"}.into()),("library_directory".into(),backend.root.join("cache/libraries").to_string_lossy().into()),
        ("resolution_width".into(),width.to_string()),("resolution_height".into(),height.to_string()),("clientid".into(),identity.client_id),("auth_xuid".into(),identity.xuid)
    ]);
    let mut jvm=minecraft::arguments(&prepared.metadata,"jvm");
    if jvm.is_empty(){jvm=vec!["-Djava.library.path=${natives_directory}".into(),"-cp".into(),"${classpath}".into()];}
    let mut args=vec![format!("-Xms{min}M"),format!("-Xmx{max}M")];
    let custom=instance.overrides.jvm_args.as_ref().unwrap_or(&settings.jvm_args);
    for arg in custom {if arg.starts_with("-javaagent")||arg.starts_with("-Dauthlibinjector")||arg.starts_with("-Djava.system.class.loader")||arg=="-cp"||arg=="-classpath"||arg.contains("auth_access_token"){return Err(BackendError::new("arguments","Authentication/classpath JVM overrides are not supported"));}}
    args.extend(custom.clone());args.extend(minecraft::substitute(jvm,&values)?);if let Some(logging)=prepared.logging{args.push(logging);}
    if account.provider=="elyby" {
        let parts=instance.minecraft.split('.').filter_map(|n|n.parse::<u32>().ok()).collect::<Vec<_>>();
        if parts.first()==Some(&1)&&parts.get(1).is_some_and(|n|*n<7||*n==7&&parts.get(2).copied().unwrap_or(0)<2) {return Err(BackendError::new("auth_legacy","Ely.by requires Minecraft 1.7.2 or newer"));}
        args.push(super::elyby::agent(backend.clone(),job.clone()).await?);
    }
    args.push(prepared.metadata["mainClass"].as_str().ok_or_else(||BackendError::new("metadata","Main class missing"))?.into());
    let mut game=minecraft::arguments(&prepared.metadata,"game");
    if game.is_empty(){if let Some(legacy)=prepared.metadata["minecraftArguments"].as_str(){game=shlex::split(legacy).ok_or_else(||BackendError::new("arguments","Invalid legacy argument syntax"))?;}}
    args.extend(minecraft::substitute(game,&values)?);
    let custom_game=instance.overrides.game_args.as_ref().unwrap_or(&settings.game_args);
    for arg in custom_game {if ["--accessToken","--uuid","--username","--userType","--xuid","--clientId","--userProperties"].iter().any(|flag|arg==flag||arg.starts_with(&format!("{flag}="))){return Err(BackendError::new("arguments","Identity arguments are managed by the selected account"));}}
    args.extend(custom_game.clone());
    if instance.overrides.fullscreen.unwrap_or(settings.fullscreen){args.push("--fullscreen".into());}
    job.check()?;job.emit("launching","running",&instance.name);
    let mut command=tokio::process::Command::new(&java.path);command.env_remove("JAVA_TOOL_OPTIONS").env_remove("_JAVA_OPTIONS").env_remove("JDK_JAVA_OPTIONS").env_remove("CLASSPATH").env_remove("CANARY_CURSEFORGE_API_KEY").args(&args).current_dir(&dir).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]command.creation_flags(0x08000000);
    let log_dir=storage::safe_join(&dir,"logs")?;std::fs::create_dir_all(&log_dir)?;let log_path=log_dir.join(format!("canary-{}.log",now()));
    let mut child=command.spawn().map_err(|e|BackendError::new("launch",e.to_string()))?;let pid=child.id().ok_or_else(||BackendError::new("launch","No process ID"))?;
    let stdout_pipe=child.stdout.take();let errors=child.stderr.take();let child=Arc::new(Mutex::new(child));
    let stopping=Arc::new(std::sync::atomic::AtomicBool::new(false));
    backend.processes.lock().unwrap().insert(instance.id.clone(),Running{pid,account:account.id.clone(),child:child.clone(),stopping:stopping.clone()});
    instance.status="running".into();instance.last_played=Some(now());instance.error=None;
    {let mut store=backend.store.lock().unwrap();if let Some(a)=store.accounts.iter_mut().find(|a|a.id==account.id){a.last_used=Some(now());}}
    if let Err(error)=backend.save_instance(&instance).and_then(|_|backend.persist()) {
        let _=child.lock().await.kill().await;
        backend.processes.lock().unwrap().remove(&instance.id);
        instance.status="failed".into();let _=backend.save_instance(&instance);
        return Err(error);
    }
    async fn output<R:tokio::io::AsyncRead+Unpin+Send+'static>(reader:R,app:Option<AppHandle>,id:String,path:std::path::PathBuf,secret:String){
        let mut lines=BufReader::new(reader).lines();while let Ok(Some(line))=lines.next_line().await{
            let safe=if line.contains("accessToken")||line.contains("access_token")||line.contains("Authorization:"){"<redacted authentication output>".into()}else{{let redacted=if secret.len()>8{line.replace(&secret,"<redacted>")}else{line};redacted.chars().take(8192).collect::<String>()}};
            if std::fs::metadata(&path).is_ok_and(|m|m.len()>5*1024*1024){let _=std::fs::rename(&path,path.with_extension("previous.log"));}
            use std::io::Write;if let Ok(mut file)=std::fs::OpenOptions::new().create(true).append(true).open(&path){let _=writeln!(file,"{safe}");}
            if let Some(app)=&app {let _=app.emit("process-output",serde_json::json!({"id":id,"line":safe}));}
        }
    }
    if let Some(stdout)=stdout_pipe {tokio::spawn(output(stdout,app.clone(),instance.id.clone(),log_path.clone(),secret.clone()));}
    if let Some(stderr)=errors {tokio::spawn(output(stderr,app.clone(),instance.id.clone(),log_path,secret));}
    let monitor=backend.clone();let started=std::time::Instant::now();
    tokio::spawn(async move {
        let exit=loop{match child.lock().await.try_wait(){Ok(Some(status))=>break Ok(status),Err(error)=>break Err(error),Ok(None)=>{}}tokio::time::sleep(std::time::Duration::from_millis(200)).await;};
        instance.playtime+=started.elapsed().as_secs();instance.status=if exit.as_ref().is_ok_and(|s|s.success())||stopping.load(std::sync::atomic::Ordering::Relaxed){ "ready" }else{"crashed"}.into();
        if let Ok(status)=&exit{if !status.success()&&!stopping.load(std::sync::atomic::Ordering::Relaxed){instance.error=Some(BackendErrorData{code:"process_exit".into(),message:format!("Minecraft exited with code {:?}",status.code())});}}
        let _=monitor.save_instance(&instance);
        {let mut store=monitor.store.lock().unwrap();store.activity.push(Activity{id:uuid::Uuid::new_v4().to_string(),timestamp:now(),instance:Some(instance.id.clone()),kind:instance.status.clone(),message:format!("{}: {}",instance.name,instance.status)});if store.activity.len()>500{store.activity.remove(0);}}
        let _=monitor.persist();monitor.processes.lock().unwrap().remove(&instance.id);
        if let Some(app)=app {let _=app.emit("process-exited",serde_json::json!({"id":instance.id,"status":instance.status,"playtime":instance.playtime,"exit_code":exit.ok().and_then(|s|s.code())}));}
    });
    job.emit("running","success",&pid.to_string());Ok(pid)
}
#[cfg(windows)]
fn request_close(pid:u32)->Result<()> {
    // A Minecraft client has no server-console "stop" command. Ask its windows to close.
    type Hwnd=isize;
    #[link(name="user32")]
    unsafe extern "system" {fn EnumWindows(callback:unsafe extern "system" fn(Hwnd,isize)->i32,param:isize)->i32;fn GetWindowThreadProcessId(window:Hwnd,pid:*mut u32)->u32;fn PostMessageW(window:Hwnd,message:u32,wparam:usize,lparam:isize)->i32;}
    unsafe extern "system" fn close(window:Hwnd,param:isize)->i32 {let mut owner=0;unsafe {GetWindowThreadProcessId(window,&mut owner);if owner==param as u32 {PostMessageW(window,0x0010,0,0);}}1}
    unsafe{EnumWindows(close,pid as isize);}Ok(())
}
#[cfg(target_os="linux")]
fn request_close(pid:u32)->Result<()> {
    if super::client_window::close(pid){Ok(())}else{Err(BackendError::new("stop_pending","Canary could not find a game window that supports normal closing. Save your world and close Minecraft manually, or explicitly choose Force stop."))}
}
#[cfg(not(any(target_os="linux",windows)))]
fn request_close(_pid:u32)->Result<()>{Err(BackendError::new("stop_pending","Close Minecraft normally, or explicitly choose Force stop."))}
pub async fn stop(backend:&Backend,id:&str,force:bool)->Result<()> {
    use std::sync::atomic::Ordering;
    let (pid,child,stopping)={let processes=backend.processes.lock().unwrap();let Some(process)=processes.get(id) else{return Ok(());};(process.pid,process.child.clone(),process.stopping.clone())};
    {
        // Hold the child lock through the signal so the monitor cannot reap it
        // and allow its OS PID to be reused between the check and the request.
        let mut process=child.lock().await;
        if process.try_wait()?.is_some(){return Ok(());}
        if force {stopping.store(true,Ordering::Relaxed);process.kill().await?;return Ok(());}
        if !stopping.swap(true,Ordering::AcqRel){if let Err(error)=request_close(pid){stopping.store(false,Ordering::Relaxed);return Err(error);}}
    }
    let deadline=std::time::Instant::now()+std::time::Duration::from_secs(8);
    while std::time::Instant::now()<deadline {if child.lock().await.try_wait()?.is_some(){return Ok(());}tokio::time::sleep(std::time::Duration::from_millis(200)).await;}
    Err(BackendError::new("stop_pending","Minecraft has not closed yet. Save the world and close the game normally. Force stop can lose unsaved progress."))
}

#[cfg(all(test,unix))]mod tests{use super::*;#[tokio::test]async fn already_exited_child_and_repeated_stop_are_safe(){let root=std::env::temp_dir().join(format!("canary-stop-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(root.clone());let b=Backend::with_root(root).unwrap();let process=tokio::process::Command::new("/bin/true").spawn().unwrap();let pid=process.id().unwrap();let child=Arc::new(Mutex::new(process));child.lock().await.wait().await.unwrap();b.processes.lock().unwrap().insert("test".into(),Running{pid,account:String::new(),child:child.clone(),stopping:Arc::new(std::sync::atomic::AtomicBool::new(false))});stop(&b,"test",false).await.unwrap();assert!(child.lock().await.try_wait().unwrap().is_some());stop(&b,"test",false).await.unwrap();b.processes.lock().unwrap().remove("test");stop(&b,"test",true).await.unwrap();}}

#[cfg(all(test,unix))]
mod pending_stop_test {
    use super::*;
    use tokio::io::AsyncBufReadExt;
    #[tokio::test]
    async fn unresponsive_child_survives_normal_stop_until_explicit_force() {
        let root=std::env::temp_dir().join(format!("canary-stop-pending-{}",uuid::Uuid::new_v4()));
        let _cleanup=storage::Staging(root.clone());let b=Backend::with_root(root).unwrap();
        let mut process=tokio::process::Command::new("/bin/sh").args(["-c","trap '' TERM; echo ready; exec /bin/sleep 60"])
            .stdout(std::process::Stdio::piped()).kill_on_drop(true).spawn().unwrap();
        let mut output=tokio::io::BufReader::new(process.stdout.take().unwrap());let mut ready=String::new();
        tokio::time::timeout(std::time::Duration::from_secs(3),output.read_line(&mut ready)).await.unwrap().unwrap();
        assert_eq!(ready.trim(),"ready");
        let pid=process.id().unwrap();let child=Arc::new(Mutex::new(process));
        b.processes.lock().unwrap().insert("test".into(),Running{pid,account:String::new(),child:child.clone(),stopping:Arc::new(std::sync::atomic::AtomicBool::new(false))});
        let result=stop(&b,"test",false).await.unwrap_err();
        assert_eq!(result.code,"stop_pending");assert!(child.lock().await.try_wait().unwrap().is_none());
        stop(&b,"test",true).await.unwrap();assert!(child.lock().await.try_wait().unwrap().is_some());
    }
}
