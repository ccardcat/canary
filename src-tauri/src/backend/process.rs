use super::{Backend,accounts,download::Job,java,minecraft,model::*,storage};
use std::{collections::HashMap,sync::Arc,process::Stdio};
use tauri::{AppHandle,Emitter};
use tokio::{io::{AsyncBufReadExt,BufReader},process::Child,sync::Mutex};
pub struct Running {pub pid:u32,pub account:String,pub child:Arc<Mutex<Child>>,pub stopping:Arc<std::sync::atomic::AtomicBool>}
pub async fn launch(backend:Arc<Backend>,mut instance:Instance,job:Arc<Job>,app:Option<AppHandle>)->Result<u32>{
    let account=accounts::selected(&backend,&instance)?;
    let identity=if account.provider=="elyby" { super::elyby::identity(&backend,&account).await? } else { accounts::launch_identity(&account)? };
    let secret=identity.access_token.clone();
    let prepared=minecraft::prepare(backend.clone(),&instance,job.clone(),false).await?;
    let java=java::select(backend.clone(),&instance,prepared.java_major,job.clone()).await?;
    let settings=backend.settings();let min=instance.overrides.min_memory.unwrap_or(settings.min_memory);let max=instance.overrides.max_memory.unwrap_or(settings.max_memory);
    super::system::validate_memory(min,max)?;
    let dir=storage::instance_dir(&backend.root,&instance.id)?;
    let width=instance.overrides.width.unwrap_or(settings.width);let height=instance.overrides.height.unwrap_or(settings.height);
    let values=HashMap::from([
        ("auth_player_name".into(),identity.username),("auth_uuid".into(),identity.uuid),("auth_access_token".into(),identity.access_token.clone()),
        ("user_type".into(),identity.user_type),("user_properties".into(),"{}".into()),("auth_session".into(),identity.access_token),
        ("version_name".into(),prepared.metadata["id"].as_str().unwrap_or(&instance.minecraft).into()),("version_type".into(),prepared.metadata["type"].as_str().unwrap_or("release").into()),
        ("game_directory".into(),dir.to_string_lossy().into()),("assets_root".into(),prepared.assets.clone()),("assets_index_name".into(),prepared.asset_index.clone()),
        ("game_assets".into(),format!("{}/virtual/{}",prepared.assets,prepared.asset_index)),("natives_directory".into(),prepared.natives.clone()),
        ("launcher_name".into(),"Canary".into()),("launcher_version".into(),env!("CARGO_PKG_VERSION").into()),("classpath".into(),prepared.classpath.join(";")),
        ("classpath_separator".into(),";".into()),("library_directory".into(),backend.root.join("cache/libraries").to_string_lossy().into()),
        ("resolution_width".into(),width.to_string()),("resolution_height".into(),height.to_string()),("clientid".into(),identity.client_id),("auth_xuid".into(),identity.xuid)
    ]);
    let mut jvm=minecraft::arguments(&prepared.metadata,"jvm");
    if jvm.is_empty(){jvm=vec!["-Djava.library.path=${natives_directory}".into(),"-cp".into(),"${classpath}".into()];}
    let mut args=vec![format!("-Xms{min}M"),format!("-Xmx{max}M")];
    let custom=instance.overrides.jvm_args.as_ref().unwrap_or(&settings.jvm_args);
    for arg in custom {if arg.starts_with("-javaagent")||arg=="-cp"||arg=="-classpath"||arg.contains("auth_access_token"){return Err(BackendError::new("arguments","Authentication/classpath JVM overrides are not supported"));}}
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
    args.extend(instance.overrides.game_args.as_ref().unwrap_or(&settings.game_args).clone());
    if instance.overrides.fullscreen.unwrap_or(settings.fullscreen){args.push("--fullscreen".into());}
    job.check()?;job.emit("launching","running",&instance.name);
    let mut command=tokio::process::Command::new(&java.path);command.args(&args).current_dir(&dir).stdout(Stdio::piped()).stderr(Stdio::piped());
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
        {let mut store=monitor.store.lock().unwrap();store.activity.push(Activity{timestamp:now(),instance:Some(instance.id.clone()),kind:instance.status.clone(),message:format!("{}: {}",instance.name,instance.status)});if store.activity.len()>500{store.activity.remove(0);}}
        let _=monitor.persist();monitor.processes.lock().unwrap().remove(&instance.id);
        if let Some(app)=app {let _=app.emit("process-exited",serde_json::json!({"id":instance.id,"status":instance.status,"playtime":instance.playtime,"exit_code":exit.ok().and_then(|s|s.code())}));}
    });
    job.emit("running","success",&pid.to_string());Ok(pid)
}
pub async fn stop(backend:&Backend,id:&str,force:bool)->Result<()> {
    let (pid,child,stopping)={let processes=backend.processes.lock().unwrap();let process=processes.get(id).ok_or_else(||BackendError::new("process","Instance is not running"))?;(process.pid,process.child.clone(),process.stopping.clone())};
    stopping.store(true,std::sync::atomic::Ordering::Relaxed);
    if force {child.lock().await.kill().await?;return Ok(());}
    // taskkill without /F requests normal Windows termination. Escalation is
    // an explicit separate user action; the process monitor records real exit.
    let mut command=tokio::process::Command::new("taskkill.exe");command.args(["/PID",&pid.to_string()]);
    #[cfg(windows)]command.creation_flags(0x08000000);
    let status=command.status().await?;if !status.success(){stopping.store(false,std::sync::atomic::Ordering::Relaxed);return Err(BackendError::new("stop_failed","Normal termination failed; save the world and close Minecraft, or choose Force stop"));}Ok(())
}
