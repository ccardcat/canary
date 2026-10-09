use super::{Backend,model::*,storage,download};
use serde::{Serialize,Deserialize};
use std::path::Path;
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imported_image_is_managed_deduplicated_persistent_and_removable() {
        let root = std::env::temp_dir().join(format!("canary-wallpaper-{}", uuid::Uuid::new_v4()));
        let _cleanup = storage::Staging(root.clone());
        let b = Backend::with_root(root.clone()).unwrap();
        let source = root.join("user image.png");
        image::RgbaImage::from_pixel(24, 16, image::Rgba([40, 120, 180, 255])).save(&source).unwrap();
        let first = import_file(&b, &source, "app").unwrap();
        let second = import_file(&b, &source, "sidebar").unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(second.target, "both");
        crate::backend::protected_fs::remove_file(source).unwrap();
        let reloaded = Backend::with_root(root).unwrap();
        let entries = list(&reloaded).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(image::open(&entries[0].image).is_ok());
        assert!(image::open(&entries[0].thumbnail).is_ok());
        assert!(remove(&reloaded, "builtin-green").is_err());
        remove(&reloaded, &first.id).unwrap();
        assert!(list(&reloaded).unwrap().is_empty());
        assert!(!Path::new(&first.image).exists());
        assert!(!Path::new(&first.thumbnail).exists());
    }
}
#[derive(Clone,Serialize,Deserialize)]pub struct Wallpaper{pub id:String,pub name:String,pub hash:String,pub target:String,pub image:String,pub thumbnail:String}
pub fn list(b:&Backend)->Result<Vec<Wallpaper>>{let path=b.root.join("wallpapers/index.json");if path.is_file(){Ok(serde_json::from_slice(&crate::backend::protected_fs::read(path)?)?)}else{Ok(vec![])}}
pub fn import_file(b:&Backend,path:&Path,target:&str)->Result<Wallpaper>{
    if !matches!(target,"app"|"sidebar"|"both"){return Err(BackendError::new("wallpaper","Invalid background target"));}
    let meta=std::fs::symlink_metadata(path)?;if !meta.is_file()||meta.len()>32*1024*1024||!path.extension().is_some_and(|s|matches!(s.to_string_lossy().to_lowercase().as_str(),"png"|"jpg"|"jpeg"|"webp")){return Err(BackendError::new("wallpaper","Choose a PNG, JPEG or WebP image up to 32 MB"));}
    let _guard=b.wallpaper_lock.lock().unwrap();let hash=download::hash(path,"sha256")?;let mut entries=list(b)?;
    if let Some(entry)=entries.iter_mut().find(|e|e.hash==hash){if entry.target!=target{entry.target="both".into();}let result=entry.clone();storage::write_json(&b.root.join("wallpapers/index.json"),&entries)?;return Ok(result);}
    let mut reader=image::ImageReader::open(path)?.with_guessed_format()?;let mut limits=image::Limits::default();limits.max_image_width=Some(16384);limits.max_image_height=Some(16384);limits.max_alloc=Some(256*1024*1024);reader.limits(limits);let decoded=reader.decode().map_err(|_|BackendError::new("wallpaper","Image is invalid or exceeds the decoding limit"))?;
    let id=format!("wallpaper-{}",uuid::Uuid::new_v4());let root=b.root.join("wallpapers");crate::backend::protected_fs::create_dir_all(&root)?;let image=root.join(format!("{id}.webp"));let thumbnail=root.join(format!("{id}-thumbnail.webp"));
    let save=|image:&image::DynamicImage,path:&Path|->Result<()>{image.save_with_format(path,image::ImageFormat::WebP).map_err(|_|BackendError::new("wallpaper","Cannot save background image"))};
    let image_data=decoded.thumbnail(3840,3840);save(&image_data,&image)?;if let Err(e)=save(&decoded.thumbnail(320,320),&thumbnail){let _=crate::backend::protected_fs::remove_file(&image);return Err(e);}
    let entry=Wallpaper{id,name:path.file_stem().unwrap_or_default().to_string_lossy().chars().filter(|c|!c.is_control()).take(80).collect(),hash,target:target.into(),image:image.to_string_lossy().into(),thumbnail:thumbnail.to_string_lossy().into()};entries.push(entry.clone());if let Err(e)=storage::write_json(&root.join("index.json"),&entries){let _=crate::backend::protected_fs::remove_file(image);let _=crate::backend::protected_fs::remove_file(thumbnail);return Err(e);}Ok(entry)
}
pub fn remove(b:&Backend,id:&str)->Result<()> {if !id.starts_with("wallpaper-")||id.len()!=46||!id.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'){return Err(BackendError::new("wallpaper","Only imported backgrounds can be removed"));}let _guard=b.wallpaper_lock.lock().unwrap();let mut entries=list(b)?;if !entries.iter().any(|e|e.id==id){return Err(BackendError::new("wallpaper","Imported background not found"));}entries.retain(|e|e.id!=id);let root=b.root.join("wallpapers");storage::write_json(&root.join("index.json"),&entries)?;for name in [format!("{id}.webp"),format!("{id}-thumbnail.webp")]{let file=storage::safe_join(&root,&name)?;if file.is_file(){crate::backend::protected_fs::remove_file(file)?;}}Ok(())}
