use super::{accounts,download::{self,Artifact,Job},java,model::*,network,protected_fs,storage,Backend};
use std::{path::Path,sync::{Arc,atomic::AtomicBool}};
fn fixture()->(std::path::PathBuf,storage::Staging){let root=std::env::temp_dir().join(format!("canary-security-{}",uuid::Uuid::new_v4()));protected_fs::create_dir_all(&root).unwrap();(root.clone(),storage::Staging(root))}
#[test]fn windows_aliases_and_pack_metadata_never_reach_an_outside_target(){
 let (root,_cleanup)=fixture();
 for path in ["../../outside.txt","C:\\Windows\\System32\\test.txt","//server/share/test","C:/outside","mods/file.jar:payload","CON","con.txt","CONIN$","COM1.jar","LPT¹.txt","config/trailing. ","config/../outside","config/\u{1f}name"]{assert!(storage::safe_join(&root,path).is_err(),"{path}");}
 for path in ["INSTANCE.JSON","Runtime.Json",".CANARY-CONTENT/state.json","SAVES/World/level.dat","Screenshots/user.png","LOGS/private.txt"]{assert!(storage::pack_path(&root,path).is_err(),"{path}");}
 for id in ["../other","C:device","a/b","CON",".."]{assert!(storage::validate_instance_id(id).is_err());}
 assert!(storage::pack_path(&root,"config/legitimate..name.json").is_ok());
}
#[test]fn malicious_zip_is_rejected_before_extracting_any_file(){
 use std::io::Write;
 for bad in ["../../outside.txt","C:/Windows/test.txt","NUL.txt"]{
  let (root,_cleanup)=fixture();let archive=root.join("attack.zip");let mut zip=zip::ZipWriter::new(protected_fs::create(&archive).unwrap());
  zip.start_file("first.txt",zip::write::SimpleFileOptions::default()).unwrap();zip.write_all(b"first").unwrap();zip.start_file(bad,zip::write::SimpleFileOptions::default()).unwrap();zip.write_all(b"attack").unwrap();zip.finish().unwrap();
  let target=root.join("instance");assert!(storage::extract(&archive,&target).is_err());assert!(!target.join("first.txt").exists());assert!(!root.join("outside.txt").exists());
 }
}
#[test]fn archive_count_size_and_overflow_budgets_are_enforced(){
 use std::io::Write;let (root,_cleanup)=fixture();let path=root.join("budget.zip");let mut zip=zip::ZipWriter::new(protected_fs::create(&path).unwrap());
 for name in ["a","b"]{zip.start_file(name,zip::write::SimpleFileOptions::default()).unwrap();zip.write_all(b"12345").unwrap();}zip.finish().unwrap();
 for limits in [storage::ExtractionLimits{entries:1,entry_bytes:10,total_bytes:20},storage::ExtractionLimits{entries:10,entry_bytes:4,total_bytes:20},storage::ExtractionLimits{entries:10,entry_bytes:10,total_bytes:9}]{assert!(storage::extract_limited(&path,&root.join("instance"),None,limits).is_err());}
 let mut budget=storage::ExtractionBudget::new(storage::ExtractionLimits{entries:10,entry_bytes:u64::MAX,total_bytes:u64::MAX});budget.entry(u64::MAX).unwrap();assert!(budget.entry(1).is_err());
}
#[test]fn credential_aliases_are_rejected_before_keyring_access(){
 let id=uuid::Uuid::new_v4().to_string();let other=uuid::Uuid::new_v4();let account=Account{id:id.clone(),provider:"microsoft".into(),credential_ref:Some(format!("microsoft-{id}")),uuid:uuid::Uuid::new_v4().simple().to_string(),username:"SecurityTest".into(),avatar:None,status:"ok".into(),last_used:None};
 assert!(accounts::credential_reference(&account,"microsoft").is_ok());assert!(accounts::credential_reference(&account,"elyby").is_err());
 let aliased=Account{credential_ref:Some(format!("microsoft-{other}")),..account};assert_eq!(accounts::credential_reference(&aliased,"microsoft").unwrap_err().code,"credential_scope");
}
#[test]fn custom_java_requires_consent_and_new_bytes_require_new_consent(){
 let (root,_cleanup)=fixture();let backend=Backend::with_root(root.clone()).unwrap();let path=root.join(if cfg!(windows){"custom.exe"}else{"custom-java"});protected_fs::write(&path,b"unapproved executable fixture").unwrap();
 assert_eq!(java::trusted_custom(&backend,&path).unwrap_err().code,"java_consent");
 let canonical=std::fs::canonicalize(&path).unwrap();let hash=download::hash(&path,"sha256").unwrap();backend.store.lock().unwrap().trusted_java.insert(canonical.to_string_lossy().into_owned(),hash);
 assert!(java::trusted_custom(&backend,&path).is_ok());protected_fs::write(&path,b"changed executable fixture").unwrap();assert!(java::trusted_custom(&backend,&path).is_err());
 assert!(java::executable_path(Path::new("relative-java")).is_err());
}
#[cfg(unix)]#[tokio::test]async fn shell_metacharacters_are_literal_process_arguments(){
 let (root,_cleanup)=fixture();let marker=root.join("must-not-exist");let value=format!("$(touch {}) ; & | `touch {}`",marker.display(),marker.display());
 java::validate_arguments(&[value.clone()],&[]).unwrap();let output=tokio::process::Command::new("/bin/echo").arg(&value).output().await.unwrap();assert!(output.status.success());assert_eq!(String::from_utf8(output.stdout).unwrap().trim(),value);assert!(!marker.exists());
}
#[tokio::test]async fn hash_mismatch_and_future_drop_do_not_publish_partial_files(){
 use tokio::{net::TcpListener,io::{AsyncReadExt,AsyncWriteExt}};let (root,_cleanup)=fixture();let backend=Arc::new(Backend::with_root(root.clone()).unwrap());let path=root.join("cache/test/artifact.jar");protected_fs::write(&path,b"old verified data").unwrap();
 let listener=TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();let server=tokio::spawn(async move{loop{let (mut socket,_)=listener.accept().await.unwrap();tokio::spawn(async move{let mut request=[0u8;1024];let _=socket.read(&mut request).await;let _=socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nxyz").await;});}});
 let job=Job::new("security-download",None,Arc::new(AtomicBool::new(false)));let item=Artifact{url:format!("http://{address}/artifact.jar"),path:path.clone(),hash:Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".into()),algorithm:"sha256",size:Some(3)};
 assert_eq!(download::file(&backend,&item,&job,"download").await.unwrap_err().code,"checksum");assert_eq!(protected_fs::read(&path).unwrap(),b"old verified data");assert_eq!(std::fs::read_dir(path.parent().unwrap()).unwrap().count(),1);server.abort();
 let parent=protected_fs::Parent::new(&root.join("cache/test/dropped.jar"),true).unwrap();let (name,file)=parent.temporary().unwrap();let cleanup=parent.guard(&name).unwrap();let future=async move{let _cleanup=cleanup;let _file=file;std::future::pending::<()>().await;};let task=tokio::spawn(future);tokio::task::yield_now().await;task.abort();let _=task.await;assert_eq!(std::fs::read_dir(path.parent().unwrap()).unwrap().count(),1);
}
#[tokio::test]async fn oversized_metadata_is_rejected_before_allocating_the_body(){
 use tokio::{net::TcpListener,io::{AsyncReadExt,AsyncWriteExt}};let listener=TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();let server=tokio::spawn(async move{let (mut socket,_)=listener.accept().await.unwrap();let mut request=[0u8;1024];let _=socket.read(&mut request).await;socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 16777217\r\nConnection: close\r\n\r\n").await.unwrap();});
 let response=network::client_builder().build().unwrap().get(format!("http://{address}")).send().await.unwrap();assert_eq!(network::json(response).await.unwrap_err().code,"metadata_limit");server.await.unwrap();
}
#[tokio::test]async fn unsafe_redirects_are_rejected_before_a_second_request(){
 use tokio::{net::TcpListener,io::{AsyncReadExt,AsyncWriteExt}};
 for destination in ["https://127.0.0.1/private","https://169.254.169.254/latest/meta-data","https://user:secret@cdn.modrinth.com/file"]{
  let listener=TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();let destination=destination.to_owned();
  let server=tokio::spawn(async move{let (mut socket,_)=listener.accept().await.unwrap();let mut request=[0u8;1024];let _=socket.read(&mut request).await;socket.write_all(format!("HTTP/1.1 302 Found\r\nLocation: {destination}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();});
  let error=network::client_builder().build().unwrap().get(format!("http://{address}/fixture")).send().await.unwrap_err();
  assert!(error.is_redirect(),"The redirect policy must reject the target before connecting: {error}");server.await.unwrap();
 }
}
