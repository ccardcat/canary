use scaffold_lib::backend::{self,Backend,model::*,download::Job,commands,storage};
use std::{sync::Arc,time::Duration};
#[tokio::main]
async fn main(){if let Err(error)=check().await {eprintln!("{}",error);std::process::exit(1);}}
async fn check()->Result<()> {
    let backend=Arc::new(Backend::new()?);let scenario=std::env::args().nth(1).unwrap_or("audit".into());
    if scenario=="secure-store"{let id=format!("validation-{}",uuid::Uuid::new_v4());backend::accounts::save_credentials(&id,"Canary disposable test credential")?;let result=backend::accounts::credentials(&id)?;keyring::Entry::new("Canary",&id).and_then(|e|e.delete_credential()).map_err(|_|BackendError::new("secure_storage","Test credential cleanup failed"))?;if result!="Canary disposable test credential"{return Err(BackendError::new("secure_storage","Credential roundtrip failed"));}println!("WINDOWS_CREDENTIAL_STORE_VERIFIED");return Ok(());}
    if scenario=="audit" {let java=backend::java::detect(&backend.root).await?;println!("Java: {}",serde_json::to_string_pretty(&java)?);println!("Instances: {}",backend.instances()?.len());return Ok(());}
    if scenario=="failure-check" {
        // Exercise actual failure paths in a disposable instance. Required game
        // artifacts are the already verified official Vanilla files, not fixtures.
        let source=std::env::args().nth(2).ok_or_else(||BackendError::new("validation","Pass a prepared Vanilla instance ID"))?;
        let original=backend.instance(&source)?;
        if original.loader!="vanilla" {return Err(BackendError::new("validation","Use a Vanilla validation instance"));}
        let root=backend.root.join("temp").join(format!("failure-{}",uuid::Uuid::new_v4()));
        let _cleanup=storage::Staging(root.clone());
        let isolated=Arc::new(Backend::with_root(root)?);
        let mut instance=Instance{internal:true,id:"validation".into(),name:"Canary failure validation".into(),minecraft:original.minecraft.clone(),provider:"vanilla".into(),..Instance::default()};
        let dir=storage::instance_dir(&isolated.root,&instance.id)?;
        std::fs::create_dir_all(&dir)?;
        instance.directory=dir.to_string_lossy().into();
        // Minecraft deliberately ignores unknown game options. Use a rejected
        // JVM option instead to deterministically exercise a real non-zero exit.
        instance.overrides.jvm_args=Some(vec!["-XX:CanaryValidationNonexistentFlag=1".into()]);
        isolated.save_instance(&instance)?;
        std::fs::copy(backend.instance_path(&source)?.join("runtime.json"),dir.join("runtime.json"))?;
        let runtime:backend::minecraft::Prepared=serde_json::from_slice(&std::fs::read(dir.join("runtime.json"))?)?;
        let java=backend::java::detect(&backend.root).await?.into_iter().find(|j|j.major==runtime.java_major).ok_or_else(||BackendError::new("validation","Compatible Java not found"))?;
        instance.overrides.java=Some(java.path);
        isolated.save_instance(&instance)?;
        backend::accounts::local(&isolated,"CanaryFailure")?;
        let cancelled=Arc::new(Job::new("cancel-test",None,Arc::new(std::sync::atomic::AtomicBool::new(true))));
        let artifact=backend::download::Artifact{url:"https://resources.download.minecraft.net/not-requested".into(),path:isolated.root.join("cache/probe"),hash:Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".into()),algorithm:"sha256",size:Some(3)};
        let error=backend::download::file(&isolated,&artifact,&cancelled,"validation").await.unwrap_err();
        if error.code!="cancelled"||artifact.path.exists(){return Err(BackendError::new("validation","Cancellation did not prevent file creation"));}
        println!("CANCELLATION_VERIFIED");
        std::fs::write(&artifact.path,b"abc")?;
        if !backend::download::valid(&artifact).await? {return Err(BackendError::new("validation","Valid hash was rejected"));}
        std::fs::write(&artifact.path,b"abd")?;
        if backend::download::valid(&artifact).await? {return Err(BackendError::new("validation","Same-size cache corruption was accepted"));}
        println!("CORRUPT_CACHE_DETECTED");
        let job=Arc::new(Job::new(&instance.id,None,Arc::new(std::sync::atomic::AtomicBool::new(false))));
        let error=backend::java::select(isolated.clone(),&instance,runtime.java_major+1,job.clone()).await.err().ok_or_else(||BackendError::new("validation","Incompatible Java was accepted"))?;
        if error.code!="java_incompatible"{return Err(BackendError::new("validation","Incompatible Java was not rejected"));}
        println!("INCOMPATIBLE_JAVA_REJECTED");
        let client=&runtime.metadata["downloads"]["client"];
        let interrupted=backend::download::Artifact{url:client["url"].as_str().ok_or_else(||BackendError::new("validation","Official client URL missing"))?.into(),path:isolated.root.join("cache/interrupted-client.jar"),hash:client["sha1"].as_str().map(str::to_owned),algorithm:"sha1",size:client["size"].as_u64()};
        let cancel=Arc::new(std::sync::atomic::AtomicBool::new(false));let timer_cancel=cancel.clone();
        let timer=tokio::spawn(async move{tokio::time::sleep(Duration::from_millis(200)).await;timer_cancel.store(true,std::sync::atomic::Ordering::Relaxed);});
        let interrupted_job=Job::new("interrupted-download",None,cancel);
        let error=backend::download::file(&isolated,&interrupted,&interrupted_job,"validation").await.err().ok_or_else(||BackendError::new("validation","Download completed before cancellation could be checked"))?;
        let _=timer.await;
        if error.code!="cancelled"||interrupted.path.exists()||std::fs::read_dir(isolated.root.join("cache"))?.flatten().any(|e|e.path().extension().is_some_and(|x|x=="part")){return Err(BackendError::new("validation","Interrupted download was not cleaned up"));}
        println!("IN_FLIGHT_CANCELLATION_AND_PARTIAL_CLEANUP_VERIFIED");
        let error=tokio::time::timeout(Duration::from_secs(5),backend::download::json(&isolated,"https://127.0.0.1:1/connection-failure-check")).await.map_err(|_|BackendError::new("validation","Network failure check timed out"))?.err().ok_or_else(||BackendError::new("validation","Closed local port unexpectedly responded"))?;
        if error.code!="network"{return Err(BackendError::new("validation","Connection failure did not retain network context"));}
        println!("NETWORK_FAILURE_CLASSIFIED");
        let error=commands::authenticate_provider("microsoft".into()).unwrap_err();
        if error.code!="auth_not_configured"{return Err(BackendError::new("validation","Legacy login command did not redirect to browser login"));}
        println!("LEGACY_LOGIN_COMMAND_REDIRECTS_TO_BROWSER_DIALOG");
        let pid=backend::process::launch(isolated.clone(),instance.clone(),job,None).await?;
        println!("FAILURE_TEST_JAVA_PID={pid}");
        for _ in 0..300 {if !isolated.processes.lock().unwrap().contains_key(&instance.id){break;}tokio::time::sleep(Duration::from_millis(200)).await;}
        if isolated.processes.lock().unwrap().contains_key(&instance.id){backend::process::stop(&isolated,&instance.id,true).await?;return Err(BackendError::new("validation","Invalid JVM argument did not cause the expected process exit"));}
        let failed=isolated.instance(&instance.id)?;
        if failed.status!="crashed"||failed.error.as_ref().map(|e|e.code.as_str())!=Some("process_exit"){return Err(BackendError::new("validation","Non-zero exit was not recorded as a crash"));}
        println!("NONZERO_EXIT_AND_CRASH_STATUS_VERIFIED");
        return Ok(());
    }
    let id=if let Some(id)=std::env::args().nth(2){id}else{
        let id=uuid::Uuid::new_v4().to_string();let directory=backend.instance_path(&id)?;std::fs::create_dir(&directory)?;
        for folder in ["mods","config","resourcepacks","shaderpacks","saves","screenshots","logs"]{std::fs::create_dir(directory.join(folder))?;}
        let minecraft="1.21.1".to_owned();let loader=if matches!(scenario.as_str(),"fabric"|"quilt"|"forge"|"neoforge"){scenario.clone()}else{"vanilla".into()};
        let loader_version=if matches!(loader.as_str(),"forge"|"neoforge"){let values=backend::loaders::versions(&backend,&minecraft,&loader).await?;Some(values[0]["loader"]["version"].as_str().ok_or_else(||BackendError::new("loader","No compatible loader"))?.to_owned())}else if loader!="vanilla"{let host=if loader=="fabric"{"https://meta.fabricmc.net/v2"}else{"https://meta.quiltmc.org/v3"};let values=backend::download::json(&backend,&format!("{host}/versions/loader/{minecraft}")).await?;Some(values[0]["loader"]["version"].as_str().ok_or_else(||BackendError::new("loader","No compatible loader"))?.to_owned())}else{None};
        let instance=Instance{internal:true,id:id.clone(),name:format!("Canary {loader} validation"),provider:"vanilla".into(),minecraft,loader,loader_version,directory:directory.to_string_lossy().into(),..Instance::default()};backend.save_instance(&instance)?;id
    };
    println!("INSTANCE_ID={id}");
    commands::prepare_instance_inner(backend.clone(),id.clone(),None,false).await?;println!("RUNTIME_READY");
    if scenario=="launch" {
        let existing={backend.store.lock().unwrap().accounts.iter().find(|a|a.provider=="local"&&a.username=="CanaryTest").cloned()};
        let account=if let Some(a)=existing{{backend.store.lock().unwrap().settings.active_account=Some(a.id.clone());}backend.persist()?;a}else{backend::accounts::local(&backend,"CanaryTest")?};println!("LOCAL_ACCOUNT={} UUID={}",account.username,account.uuid);
        let lease=backend.lease(&id)?;let job=Arc::new(Job::new(&id,None,lease.cancel.clone()));
        let pid=backend::process::launch(backend.clone(),backend.instance(&id)?,job,None).await?;drop(lease);println!("JAVA_PROCESS_PID={pid}");
        let hold=std::env::var("CANARY_CHECK_HOLD_SECONDS").ok().and_then(|s|s.parse::<u64>().ok()).unwrap_or(60).clamp(20,300);
        tokio::time::sleep(Duration::from_secs(hold)).await;
        if !backend.processes.lock().unwrap().contains_key(&id){let i=backend.instance(&id)?;return Err(BackendError::new("launch_validation",format!("Game exited early: {}",serde_json::to_string(&i.error)?)));}
        println!("GAME_RUNNING_{hold}_SECONDS");
        backend::process::stop(&backend,&id,false).await?;
        for _ in 0..100 {if !backend.processes.lock().unwrap().contains_key(&id){break;}tokio::time::sleep(Duration::from_millis(200)).await;}
        let final_state=backend.instance(&id)?;println!("FINAL_STATUS={} PLAYTIME={}",final_state.status,final_state.playtime);
        if final_state.status!="ready"||final_state.playtime==0{return Err(BackendError::new("launch_validation","Exit/playtime was not recorded"));}
        let restored=Backend::new()?;let persisted=restored.instance(&id)?;
        if persisted.playtime!=final_state.playtime||!restored.store.lock().unwrap().accounts.iter().any(|a|a.id==account.id&&a.uuid==account.uuid){return Err(BackendError::new("persistence","Account or instance did not survive reload"));}println!("PERSISTENCE_VERIFIED");
    }
    Ok(())
}
