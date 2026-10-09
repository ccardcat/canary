//! Integrity receipts speed up reuse without trusting only file length.
use super::{download,model::*,storage};
use serde::{Deserialize,Serialize};
use std::{path::{Path,PathBuf},sync::atomic::AtomicBool};
#[derive(Clone,Serialize,Deserialize)]
pub struct Receipt {pub path:String,pub size:u64,pub sha256:String}
pub fn capture(path:&Path,cancel:Option<&AtomicBool>)->Result<Receipt>{
 let file=super::protected_fs::open(path)?;let size=file.metadata()?.len();
 let mut file=file;let sha256=download::hash_reader(&mut file,"sha256",cancel)?;
 Ok(Receipt{path:path.to_string_lossy().into_owned(),size,sha256})
}
pub fn verify(files:&[Receipt],roots:&[PathBuf],cancel:Option<&AtomicBool>)->Result<bool>{
 if files.is_empty()||files.len()>200_000{return Ok(false);}
 for receipt in files {
  let path=Path::new(&receipt.path);
  if !roots.iter().any(|root|path.strip_prefix(root).is_ok_and(|rel|storage::safe_join(root,&rel.to_string_lossy().replace('\\',"/")).is_ok())) {return Ok(false);}
  if download::validate_hash(&receipt.sha256,"sha256").is_err(){return Ok(false);}
  let mut file=match super::protected_fs::open(path){Ok(file)=>file,Err(_)=>return Ok(false)};
  if file.metadata()?.len()!=receipt.size{return Ok(false);}
  if !download::hash_reader(&mut file,"sha256",cancel)?.eq_ignore_ascii_case(&receipt.sha256){return Ok(false);}
 }
 Ok(true)
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn same_size_tampering_and_outside_receipts_are_rejected(){
  let root=std::env::temp_dir().join(format!("canary-integrity-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(root.clone());
  let path=root.join("mod.jar");super::super::protected_fs::write(&path,b"verified").unwrap();let files=vec![capture(&path,None).unwrap()];
  assert!(verify(&files,&[root.clone()],None).unwrap());super::super::protected_fs::write(&path,b"tampered").unwrap();assert!(!verify(&files,&[root.clone()],None).unwrap());
  let outside=vec![capture(&path,None).unwrap()];assert!(!verify(&outside,&[root.join("other")],None).unwrap());
 }
}
