//! Read only the instance/version columns from a disposable database snapshot.
//! Modrinth account and session tables are never queried or imported.
use super::{collection::TransferSource,model::*,protected_fs as fs,storage};
use std::path::Path;
pub fn scan(root:&Path)->Result<Vec<TransferSource>>{
 let mut result=vec![];
 for filename in ["app.db","modrinth.db","theseus.db"]{
  let input=root.join(filename);if !input.is_file(){continue;}
  let temp=std::env::temp_dir().join(format!("canary-import-db-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(temp.clone());fs::create_dir_all(&temp)?;
  if fs::open(&input)?.metadata()?.len()>256*1024*1024{return Err(BackendError::new("collection_import","Launcher database is too large"));}
  fs::copy(input,temp.join("snapshot.db"))?;
  for suffix in ["-wal","-shm"]{let source=root.join(format!("{filename}{suffix}"));if source.is_file(){if fs::open(&source)?.metadata()?.len()>256*1024*1024{return Err(BackendError::new("collection_import","Close the source launcher before importing"));}fs::copy(source,temp.join(format!("snapshot.db{suffix}")))?;}}
  let connection=rusqlite::Connection::open_with_flags(temp.join("snapshot.db"),rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY|rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|_|BackendError::new("collection_import","Cannot read the launcher database. Close Modrinth and try again."))?;
  let modern="SELECT i.path,i.name,c.game_version,c.loader,c.loader_version FROM instances i JOIN instance_content_sets c ON c.id=i.applied_content_set_id LIMIT 256";
  let legacy="SELECT path,name,game_version,mod_loader,mod_loader_version FROM profiles LIMIT 256";
  let mut query=connection.prepare(modern).or_else(|_|connection.prepare(legacy)).map_err(|_|BackendError::new("collection_import","This launcher database format is not supported"))?;
  let rows=query.query_map([],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,Option<String>>(4)?))).map_err(|_|BackendError::new("collection_import","Cannot list launcher instances"))?;
  for row in rows{let (relative,name,minecraft,loader,version)=row.map_err(|_|BackendError::new("collection_import","Invalid launcher instance metadata"))?;
   // Modrinth paths are relative names under profiles; absolute paths and links
   // from imported metadata cannot choose an unrelated folder.
   let mut selected=None;for base in [root.join("profiles"),root.join("instances")]{if let Ok(path)=storage::safe_join(&base,&relative){if path.is_dir()&&fs::directory(&path,false).is_ok(){selected=Some(path);break;}}}
   let Some(path)=selected else{continue};if !matches!(loader.as_str(),"vanilla"|"fabric"|"quilt"|"forge"|"neoforge"){continue;}
   let loader_version=version.map(|v|v.trim_start_matches(&format!("{minecraft}-")).to_owned());result.push(TransferSource{token:uuid::Uuid::new_v4().to_string(),name,minecraft,loader,loader_version,directory:path.to_string_lossy().into(),path});
  }
 }Ok(result)
}
#[cfg(test)]mod tests{use super::*;#[test]fn imports_current_modrinth_instances_without_reading_accounts(){let root=std::env::temp_dir().join(format!("canary-modrinth-db-{}",uuid::Uuid::new_v4()));let _clean=storage::Staging(root.clone());fs::create_dir_all(root.join("profiles/demo")).unwrap();let db=rusqlite::Connection::open(root.join("app.db")).unwrap();db.execute_batch("CREATE TABLE instances(id TEXT,path TEXT,name TEXT,applied_content_set_id TEXT);CREATE TABLE instance_content_sets(id TEXT,game_version TEXT,loader TEXT,loader_version TEXT);CREATE TABLE minecraft_users(access_token TEXT);INSERT INTO instances VALUES('id','demo','Test pack','set');INSERT INTO instance_content_sets VALUES('set','1.21.1','fabric','0.16.0');INSERT INTO minecraft_users VALUES('do not import');").unwrap();drop(db);let sources=scan(&root).unwrap();assert_eq!(sources.len(),1);assert_eq!(sources[0].name,"Test pack");assert_eq!(sources[0].minecraft,"1.21.1");assert_eq!(sources[0].loader_version.as_deref(),Some("0.16.0"));}}
