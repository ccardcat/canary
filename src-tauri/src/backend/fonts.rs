//! Imported fonts live in Canary's own library; system fonts are never installed.
use super::{Backend,model::*,protected_fs as fs,storage};
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use std::{io::Read,path::{Path,PathBuf},sync::Arc};
use tauri::{AppHandle,Manager,State};

const MAX_BYTES:u64=16*1024*1024;
#[derive(Clone,Serialize,Deserialize)]
pub struct UserFont{pub id:String,pub name:String,pub extension:String,pub hash:String}
#[derive(Serialize)]
pub struct FontEntry{pub id:String,pub name:String,pub path:String}
fn folder(b:&Backend)->PathBuf{b.root.join("fonts")}
fn font_error(message:&str)->BackendError{BackendError::new("font",message)}
fn validate_id(id:&str)->Result<()>{uuid::Uuid::parse_str(id).map_err(|_|font_error("Invalid font identity"))?;Ok(())}
fn index(b:&Backend)->Result<Vec<UserFont>>{
 let path=folder(b).join("index.json");if !path.is_file(){return Ok(vec![])}
 if fs::open(&path)?.metadata()?.len()>128*1024{return Err(font_error("Font library metadata is too large"))}
 let fonts:Vec<UserFont>=serde_json::from_slice(&fs::read(path)?)?;
 if fonts.len()>64{return Err(font_error("The font library can store up to 64 fonts"))}
 for font in &fonts{validate_id(&font.id)?;if !matches!(font.extension.as_str(),"ttf"|"otf"){return Err(font_error("Invalid font file type"))}}
 Ok(fonts)
}
fn path(b:&Backend,font:&UserFont)->PathBuf{folder(b).join(format!("{}.{}",font.id,font.extension))}
fn entry(b:&Backend,font:&UserFont)->FontEntry{FontEntry{id:font.id.clone(),name:font.name.clone(),path:path(b,font).to_string_lossy().into()}}
pub fn list(b:&Backend)->Result<Vec<FontEntry>>{Ok(index(b)?.iter().filter(|font|path(b,font).is_file()).map(|font|entry(b,font)).collect())}
fn validate(bytes:&[u8])->Result<()>{
 // Validate the sfnt directory before the browser's font parser handles tables.
 if bytes.len()<12||bytes.len() as u64>MAX_BYTES||!matches!(&bytes[..4],b"\x00\x01\x00\x00"|b"OTTO"|b"true"){return Err(font_error("Choose a TrueType or OpenType font up to 16 MiB"))}
 let tables=u16::from_be_bytes([bytes[4],bytes[5]]) as usize;
 let end=12+tables*16;
 if tables==0||tables>256||end>bytes.len(){return Err(font_error("The font has an invalid table directory"))}
 let mut tags=std::collections::HashSet::new();
 for table in bytes[12..end].chunks_exact(16){
  let offset=u32::from_be_bytes(table[8..12].try_into().unwrap()) as usize;
  let length=u32::from_be_bytes(table[12..16].try_into().unwrap()) as usize;
  if offset<end||offset.checked_add(length).is_none_or(|last|last>bytes.len())||!tags.insert(&table[..4]){return Err(font_error("The font contains invalid tables"))}
 }
 if ![b"head".as_slice(),b"cmap".as_slice(),b"maxp".as_slice(),b"name".as_slice()].iter().all(|tag|tags.contains(*tag)){return Err(font_error("The font is missing required tables"))}
 Ok(())
}
pub fn import_file(b:&Backend,source:&Path)->Result<FontEntry>{
 let extension=source.extension().map(|value|value.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
 if !matches!(extension.as_str(),"ttf"|"otf"){return Err(font_error("Choose a .ttf or .otf font"))}
 let input=fs::open(source)?;if input.metadata()?.len()>MAX_BYTES{return Err(font_error("Choose a font up to 16 MiB"))}
 let mut bytes=vec![];input.take(MAX_BYTES+1).read_to_end(&mut bytes)?;validate(&bytes)?;
 let hash=Sha256::digest(&bytes).iter().map(|byte|format!("{byte:02x}")).collect::<String>();let mut fonts=index(b)?;
 if let Some(font)=fonts.iter().find(|font|font.hash==hash){
  if !path(b,font).is_file(){fs::write(path(b,font),&bytes)?}
  return Ok(entry(b,font))
 }
 if fonts.len()>=64{return Err(font_error("The font library can store up to 64 fonts"))}
 let name=source.file_stem().unwrap_or_default().to_string_lossy().chars().filter(|c|!c.is_control()).take(100).collect::<String>();
 let font=UserFont{id:uuid::Uuid::new_v4().to_string(),name:if name.trim().is_empty(){"Custom font".into()}else{name},extension,hash};
 let target=path(b,&font);fs::write(&target,&bytes)?;fonts.push(font.clone());
 if let Err(error)=storage::write_json(&folder(b).join("index.json"),&fonts){let _=fs::remove_file(target);return Err(error)}
 Ok(entry(b,&font))
}
pub fn remove(b:&Backend,id:&str)->Result<()>{
 validate_id(id)?;let mut fonts=index(b)?;let font=fonts.iter().find(|font|font.id==id).cloned().ok_or_else(||font_error("Font no longer exists"))?;
 fonts.retain(|font|font.id!=id);storage::write_json(&folder(b).join("index.json"),&fonts)?;
 let target=path(b,&font);if target.is_file(){fs::remove_file(target)?}Ok(())
}
fn allow(app:&AppHandle,font:&FontEntry){let _=app.asset_protocol_scope().allow_file(&font.path);}
#[tauri::command]pub fn list_fonts(backend:State<'_,Arc<Backend>>,app:AppHandle)->Result<Vec<FontEntry>>{
 let _lease=backend.inner().lease("font-library")?;let fonts=list(&backend)?;for font in &fonts{allow(&app,font)}Ok(fonts)
}
#[tauri::command]pub async fn import_font(backend:State<'_,Arc<Backend>>,app:AppHandle)->Result<Option<FontEntry>>{
 let b=backend.inner().clone();tokio::task::spawn_blocking(move||{use tauri_plugin_dialog::DialogExt;let _lease=b.lease("font-library")?;
 let Some(file)=app.dialog().file().add_filter("TrueType / OpenType",&["ttf","otf"]).blocking_pick_file()else{return Ok(None)};
 let source=file.into_path().map_err(|_|font_error("Invalid font path"))?;let font=import_file(&b,&source)?;allow(&app,&font);Ok(Some(font))
 }).await.map_err(|_|font_error("Cannot import this font"))?
}
#[tauri::command]pub fn remove_font(backend:State<'_,Arc<Backend>>,id:String)->Result<()>{let _lease=backend.inner().lease("font-library")?;remove(&backend,&id)}

#[cfg(test)]mod tests{
 use super::*;
 const FONT:&[u8]=include_bytes!("../../../public/Monocraft.ttf");
 #[test]fn validates_table_bounds_and_font_type(){validate(FONT).unwrap();assert!(validate(b"not a font").is_err());assert!(validate(&FONT[..16]).is_err());let mut invalid=FONT.to_vec();invalid[20..24].copy_from_slice(&u32::MAX.to_be_bytes());assert!(validate(&invalid).is_err());let mut otf=FONT.to_vec();otf[..4].copy_from_slice(b"OTTO");validate(&otf).unwrap();}
 #[test]fn imported_font_is_independent_deduplicated_and_persistent(){
  let root=std::env::temp_dir().join(format!("canary-fonts-{}",uuid::Uuid::new_v4()));let _cleanup=storage::Staging(root.clone());let b=Backend::with_root(root.clone()).unwrap();let source=root.join("My font.ttf");fs::write(&source,FONT).unwrap();
  let first=import_file(&b,&source).unwrap();assert_ne!(Path::new(&first.path),source);let second=import_file(&b,&source).unwrap();assert_eq!(first.id,second.id);fs::remove_file(source).unwrap();
  let reloaded=Backend::with_root(root).unwrap();assert_eq!(list(&reloaded).unwrap().len(),1);validate(&fs::read(&first.path).unwrap()).unwrap();assert!(remove(&reloaded,"../outside").is_err());remove(&reloaded,&first.id).unwrap();assert!(list(&reloaded).unwrap().is_empty());assert!(!Path::new(&first.path).exists());
 }
}
