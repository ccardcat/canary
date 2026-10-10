use super::{Backend,content,content_provider,download,model::*,storage};
use std::{path::{Path,PathBuf},io::Write,sync::{Arc,atomic::AtomicBool}};
use serde_json::json;

#[test]
fn declared_minecraft_ranges_and_loader_versions_are_checked() {
 let (b,_cleanup,mut i)=setup();i.loader_version=Some("0.16.10".into());
 let path=b.root.join("ranges.jar");
 archive(&path,&[("fabric.mod.json",br#"{"id":"ranges","name":"Range Test","version":"1","depends":{"minecraft":">=1.21 <1.22","fabricloader":">=0.16"}}"#)]);
 assert!(content::inspect(&path,&i).unwrap().issue.is_none());
 i.minecraft="26.2".into();let issue=content::inspect(&path,&i).unwrap().issue.unwrap();assert_eq!(issue.reason,"minecraft");assert_eq!(issue.name,"Range Test");
 i.minecraft="1.21.1".into();i.loader_version=Some("0.15.0".into());assert_eq!(content::inspect(&path,&i).unwrap().issue.unwrap().reason,"loader_version");
}
#[test]
fn forge_and_neoforge_metadata_use_declared_maven_ranges() {
 let (b,_cleanup,mut i)=setup();i.loader="neoforge".into();i.loader_version=Some("21.1.10".into());
 let path=b.root.join("neo.jar");archive(&path,&[("META-INF/neoforge.mods.toml",b"modLoader=\"javafml\"\n[[mods]]\nmodId=\"neo_test\"\ndisplayName=\"Neo Test\"\nversion=\"1\"\n[[dependencies.neo_test]]\nmodId=\"minecraft\"\ntype=\"required\"\nversionRange=\"[1.21,1.22)\"\n[[dependencies.neo_test]]\nmodId=\"neoforge\"\ntype=\"required\"\nversionRange=\"[21.1,)\"")]);
 let info=content::inspect(&path,&i).unwrap();assert_eq!(info.name,"Neo Test");assert!(info.issue.is_none());
 i.minecraft="26.2".into();assert_eq!(content::inspect(&path,&i).unwrap().issue.unwrap().reason,"minecraft");
}
#[test]
fn multi_loader_archive_uses_the_metadata_for_this_instance() {
 let (b,_cleanup,mut i)=setup();i.loader="forge".into();let path=b.root.join("multi.jar");
 archive(&path,&[("fabric.mod.json",br#"{"id":"multi","name":"Fabric variant","depends":{"minecraft":"1.20.1"}}"#),("META-INF/mods.toml",b"modLoader=\"javafml\"\n[[mods]]\nmodId=\"multi\"\ndisplayName=\"Forge variant\"\nversion=\"1\"")]);
 let info=content::inspect(&path,&i).unwrap();assert_eq!(info.loader.as_deref(),Some("forge"));assert_eq!(info.name,"Forge variant");assert!(info.issue.is_none());
}
#[test]
fn bundled_fabric_mods_satisfy_dependencies_without_becoming_top_level_duplicates() {
 let (b,_cleanup,i)=setup();let bundled=b.root.join("bundled.jar");archive(&bundled,&[("fabric.mod.json",br#"{"id":"library","name":"Bundled Library","version":"2"}"#)]);
 let bytes=crate::backend::protected_fs::read(&bundled).unwrap();let path=b.root.join("container.jar");
 archive(&path,&[("fabric.mod.json",br#"{"id":"container","name":"Container","version":"1","depends":{"library":">=2"},"jars":[{"file":"META-INF/jars/library.jar"}]}"#),("META-INF/jars/library.jar",&bytes)]);
 let info=content::inspect(&path,&i).unwrap();assert_eq!(info.mod_ids,vec!["container"]);assert_eq!(info.metadata.len(),2);
 assert!(super::content_compatibility::relationships(&info.metadata,&["container".into()],&[],&[]).is_none());
}
#[test]
fn import_preview_checks_dependencies_as_one_selection() {
 let (b,_cleanup,i)=setup();let user=b.root.join("preview-user.jar");let library=b.root.join("preview-library.jar");
 archive(&user,&[("fabric.mod.json",br#"{"id":"user","name":"User mod","version":"1","depends":{"library":">=2"}}"#)]);
 archive(&library,&[("fabric.mod.json",br#"{"id":"library","name":"Library","version":"2"}"#)]);
 let one=content_provider::inspect_batch(&b,&i.id,&[user.to_string_lossy().into()]).unwrap();assert_eq!(one[0].issue.as_ref().unwrap().reason,"dependency_missing");
 let both=content_provider::inspect_batch(&b,&i.id,&[user.to_string_lossy().into(),library.to_string_lossy().into()]).unwrap();assert!(both.iter().all(|i|i.issue.is_none()));
 let root=b.instance_path(&i.id).unwrap();assert!(!root.join("mods/preview-user.jar").exists());assert!(!root.join("mods/preview-library.jar").exists());
}
#[test]
fn rejected_local_import_does_not_change_installed_mods_or_snapshots() {
 let (b,_cleanup,i)=setup();let source=b.root.join("wrong.jar");archive(&source,&[("fabric.mod.json",br#"{"id":"wrong","name":"Wrong MC","version":"1","depends":{"minecraft":">=1.22"}}"#)]);
 let root=b.instance_path(&i.id).unwrap();let error=content_provider::import(&b,&i.id,vec![source.to_string_lossy().into()],None).err().unwrap();assert_eq!(error.code,"content_incompatible");assert_eq!(error.context.unwrap()["name"],"Wrong MC");
 assert!(!root.join("mods/wrong.jar").exists());let state=content::load(&root).unwrap();assert!(state.items.is_empty());assert!(state.snapshots.is_empty());assert!(source.is_file());
}
#[test]
fn import_validates_a_whole_dependency_batch_before_commit() {
 let (b,_cleanup,i)=setup();let user=b.root.join("user.jar");let library=b.root.join("library.jar");
 archive(&user,&[("fabric.mod.json",br#"{"id":"user","name":"User mod","version":"1","depends":{"library":">=2"}}"#)]);
 archive(&library,&[("fabric.mod.json",br#"{"id":"library","name":"Library","version":"2"}"#)]);
 let root=b.instance_path(&i.id).unwrap();let error=content_provider::import(&b,&i.id,vec![user.to_string_lossy().into()],None).err().unwrap();assert_eq!(error.code,"dependency");assert_eq!(error.context.unwrap()["dependency"],"library");assert!(!root.join("mods/user.jar").exists());
 let state=content_provider::import(&b,&i.id,vec![user.to_string_lossy().into(),library.to_string_lossy().into()],None).unwrap();assert_eq!(state.items.len(),2);
}
#[test]
fn installed_reverse_conflicts_and_duplicate_mod_ids_are_rejected() {
 let (b,_cleanup,i)=setup();let old=b.root.join("old.jar");let new=b.root.join("new.jar");
 archive(&old,&[("fabric.mod.json",br#"{"id":"old","name":"Old mod","version":"1","breaks":{"new":"*"}}"#)]);
 archive(&new,&[("fabric.mod.json",br#"{"id":"new","name":"New mod","version":"1"}"#)]);
 content_provider::import(&b,&i.id,vec![old.to_string_lossy().into()],None).unwrap();
 let root=b.instance_path(&i.id).unwrap();let hash=download::hash(&root.join("mods/old.jar"),"sha512").unwrap();
 let error=content_provider::import(&b,&i.id,vec![new.to_string_lossy().into()],None).err().unwrap();let context=error.context.unwrap();assert_eq!(context["name"],"Old mod");assert_eq!(context["other"],"New mod");assert!(!root.join("mods/new.jar").exists());assert_eq!(download::hash(&root.join("mods/old.jar"),"sha512").unwrap(),hash);
 archive(&new,&[("fabric.mod.json",br#"{"id":"old","name":"Duplicate mod","version":"2"}"#)]);
 assert_eq!(content_provider::import(&b,&i.id,vec![new.to_string_lossy().into()],None).err().unwrap().code,"content_duplicate");
}
#[test]
fn curseforge_pack_update_preserves_provenance_user_files_and_rollback() {
    let (b, _cleanup, mut i) = setup();
    i.provider = "curseforge".into();
    i.project_id = Some("100".into());
    i.version_id = Some("200".into());
    i.loader_version = Some("0.16.10".into());
    b.save_instance(&i).unwrap();
    let root = b.instance_path(&i.id).unwrap();
    fabric(&root.join("mods/sample.jar"));
    let original = download::hash(&root.join("mods/sample.jar"), "sha512").unwrap();
    let receipt = json!([{"path":"mods/sample.jar","hash":original,"project":"300","file":"400"}]);
    for name in ["pack-content-files.json", "curseforge-files.json"] {
        storage::write_json(&root.join(name), &receipt).unwrap();
    }
    storage::write_json(&root.join("curseforge-manifest.json"), &json!({"version":"old"})).unwrap();
    let world = root.join("saves/World");
    crate::backend::protected_fs::create_dir_all(&world).unwrap();
    crate::backend::protected_fs::write(world.join("level.dat"), b"world preserved").unwrap();
    let stage = b.root.join("cf-update");
    archive(&stage.join("mods/sample.jar"), &[("fabric.mod.json", br#"{"id":"sample","name":"Sample mod","version":"2"}"#)]);
    let mut incoming = i.clone();
    incoming.version_id = Some("201".into());
    incoming.version_name = "2".into();
    storage::write_json(&stage.join("instance.json"), &incoming).unwrap();
    let next_hash = download::hash(&stage.join("mods/sample.jar"), "sha512").unwrap();
    let next_receipt = json!([{"path":"mods/sample.jar","hash":next_hash,"project":"300","file":"401"}]);
    for name in ["pack-content-files.json", "curseforge-files.json"] {
        storage::write_json(&stage.join(name), &next_receipt).unwrap();
    }
    storage::write_json(&stage.join("curseforge-manifest.json"), &json!({"version":"new"})).unwrap();
    let state = super::pack_update::apply_staged(&b, &i.id, &stage, "201").unwrap();
    assert_eq!(state.items[0].provider, "curseforge");
    assert_eq!(state.items[0].project.as_deref(), Some("300"));
    assert_eq!(state.items[0].provider_version.as_deref(), Some("401"));
    let restored = Backend::with_root(b.root.clone()).unwrap();
    content::rollback(&restored, &i.id).unwrap();
    assert_eq!(restored.instance(&i.id).unwrap().version_id.as_deref(), Some("200"));
    assert_eq!(download::hash(&root.join("mods/sample.jar"), "sha512").unwrap(), original);
    assert_eq!(content::load(&root).unwrap().items[0].provider_version.as_deref(), Some("400"));
    assert_eq!(crate::backend::protected_fs::read(world.join("level.dat")).unwrap(), b"world preserved");
}

#[test]
fn switching_provider_cannot_duplicate_a_mod_or_overwrite_its_file() {
    let (b, _cleanup, i) = setup();
    let jar = b.root.join("sample.jar");
    fabric(&jar);
    let mut state = content_provider::import(&b, &i.id, vec![jar.to_string_lossy().into()], None).unwrap();
    state.items[0].project = Some("original-project".into());
    let root = b.instance_path(&i.id).unwrap();
    content::save(&root, &state).unwrap();
    let old = state.items[0].clone();
    let mut incoming = old.clone();
    incoming.id = uuid::Uuid::new_v4().to_string();
    incoming.provider = "curseforge".into();
    incoming.project = Some("123".into());
    incoming.path = "mods/another-name.jar".into();
    let error = content_provider::apply(&b, &i.id, state, vec![(incoming, jar)]).err().unwrap();
    assert_eq!(error.code, "content_duplicate");
    assert_eq!(download::hash(&root.join(&old.path), "sha512").unwrap(), old.hash);
    assert!(!root.join("mods/another-name.jar").exists());
    assert!(content::load(&root).unwrap().snapshots.len() <= 1);
}
fn setup()->(Arc<Backend>,storage::Staging,Instance){let root=std::env::temp_dir().join(format!("canary-content-test-{}",uuid::Uuid::new_v4()));let cleanup=storage::Staging(root.clone());let b=Arc::new(Backend::with_root(root).unwrap());let i=Instance{id:"isolated".into(),name:"Content validation".into(),minecraft:"1.21.1".into(),loader:"fabric".into(),..Instance::default()};crate::backend::protected_fs::create_dir_all(storage::instance_dir(&b.root,&i.id).unwrap()).unwrap();b.save_instance(&i).unwrap();(b,cleanup,i)}
fn archive(path:&Path,entries:&[(&str,&[u8])]) {crate::backend::protected_fs::create_dir_all(path.parent().unwrap()).unwrap();let mut zip=zip::ZipWriter::new(crate::backend::protected_fs::create(path).unwrap());for (name,data) in entries {zip.start_file(*name,zip::write::SimpleFileOptions::default()).unwrap();zip.write_all(data).unwrap();}zip.finish().unwrap();}
fn fabric(path:&Path){archive(path,&[("fabric.mod.json",br#"{"id":"sample","name":"Sample mod","version":"1.0","environment":"client","depends":{"minecraft":"1.21.1"}}"#)]);}
#[test]fn archive_types_and_loader_safety(){let (b,_cleanup,i)=setup();let jar=b.root.join("sample.jar");fabric(&jar);assert_eq!(content::inspect(&jar,&i).unwrap().kind,"mod");let forge=b.root.join("forge.jar");archive(&forge,&[("META-INF/mods.toml",b"modLoader=\"javafml\"\n[[mods]]\nmodId=\"forge_test\"\nversion=\"1\"")]);assert_eq!(content::inspect(&forge,&i).unwrap().compatibility,"incompatible");let pack=b.root.join("pack.zip");archive(&pack,&[("pack.mcmeta",br#"{"pack":{"pack_format":34,"description":"Pack"}}"#),("assets/minecraft/a.txt",b"pack")]);assert_eq!(content::inspect(&pack,&i).unwrap().kind,"resourcepack");let shader=b.root.join("shader.zip");archive(&shader,&[("shaders/a.fsh",b"shader")]);assert_eq!(content::inspect(&shader,&i).unwrap().kind,"shader");crate::backend::protected_fs::write(&pack,b"not zip").unwrap();assert!(content::inspect(&pack,&i).is_err());archive(&pack,&[("../escape",b"bad")]);assert!(content::inspect(&pack,&i).is_err());}
#[test]fn datapack_requires_world_and_preserves_save(){let (b,_cleanup,i)=setup();let pack=b.root.join("datapack.zip");archive(&pack,&[("pack.mcmeta",br#"{"pack":{"pack_format":48}}"#),("data/sample/function/test.mcfunction",b"say test")]);assert!(content_provider::import(&b,&i.id,vec![pack.to_string_lossy().into()],None).is_err());assert!(content_provider::import(&b,&i.id,vec![pack.to_string_lossy().into()],Some("Missing".into())).is_err());let root=storage::instance_dir(&b.root,&i.id).unwrap();crate::backend::protected_fs::create_dir_all(root.join("saves/World")).unwrap();crate::backend::protected_fs::write(root.join("saves/World/level.dat"),b"world fixture").unwrap();let s=content_provider::import(&b,&i.id,vec![pack.to_string_lossy().into()],Some("World".into())).unwrap();assert!(s.items[0].path.starts_with("saves/World/datapacks/"));assert_eq!(content::worlds(&root).unwrap().len(),1);content::mutate(&b,&i.id,&[s.items[0].id.clone()],"remove").unwrap();content::rollback(&b,&i.id).unwrap();assert_eq!(crate::backend::protected_fs::read(root.join("saves/World/level.dat")).unwrap(),b"world fixture");assert!(root.join("saves/World/datapacks/datapack.zip").is_file());}
#[test]fn local_import_toggle_duplicate_and_rollback(){let (b,_cleanup,i)=setup();let jar=b.root.join("sample.jar");fabric(&jar);let state=content_provider::import(&b,&i.id,vec![jar.to_string_lossy().into()],None).unwrap();let item=&state.items[0];assert!(content_provider::import(&b,&i.id,vec![jar.to_string_lossy().into()],None).is_err());let root=storage::instance_dir(&b.root,&i.id).unwrap();let state=content::mutate(&b,&i.id,&[item.id.clone()],"disable").unwrap();assert!(!root.join("mods/sample.jar").exists());assert!(root.join(content::location(&state.items[0])).is_file());let restored=Backend::with_root(b.root.clone()).unwrap();assert!(!content::load(&root).unwrap().items[0].enabled);let state=content::mutate(&restored,&i.id,&[item.id.clone()],"enable").unwrap();assert!(state.items[0].enabled);content::mutate(&b,&i.id,&[item.id.clone()],"remove").unwrap();assert!(!root.join("mods/sample.jar").exists());let restored=content::rollback(&b,&i.id).unwrap();assert_eq!(restored.items[0].hash,download::hash(&root.join("mods/sample.jar"),"sha512").unwrap());assert!(jar.is_file());}
#[test]fn rollback_never_overwrites_unknown_files(){let(b,_cleanup,i)=setup();let jar=b.root.join("sample.jar");fabric(&jar);let state=content_provider::import(&b,&i.id,vec![jar.to_string_lossy().into()],None).unwrap();let root=storage::instance_dir(&b.root,&i.id).unwrap();content::mutate(&b,&i.id,&[state.items[0].id.clone()],"remove").unwrap();crate::backend::protected_fs::write(root.join("mods/sample.jar"),b"manually added replacement").unwrap();assert!(content::rollback(&b,&i.id).is_err());assert_eq!(crate::backend::protected_fs::read(root.join("mods/sample.jar")).unwrap(),b"manually added replacement");}
#[test]fn provider_version_must_match_game_and_loader(){let (_,_,i)=setup();assert!(content_provider::compatible(&json!({"game_versions":["1.21.1"],"loaders":["fabric"]}),&i,"mod"));assert!(!content_provider::compatible(&json!({"game_versions":["1.21.1"],"loaders":["forge"]}),&i,"mod"));assert!(!content_provider::compatible(&json!({"game_versions":["1.20.1"],"loaders":["fabric"]}),&i,"mod"));assert!(content_provider::compatible(&json!({"game_versions":["1.21.1"],"loaders":["minecraft"]}),&i,"resourcepack"));}
#[test]fn repair_respects_pack_disable_receipt(){let(b,_cleanup,i)=setup();let root=storage::instance_dir(&b.root,&i.id).unwrap();fabric(&root.join("mods/sample.jar"));storage::write_json(&root.join("modrinth.index.json"),&json!({"files":[{"path":"mods/sample.jar","hashes":{"sha512":download::hash(&root.join("mods/sample.jar"),"sha512").unwrap()},"downloads":["https://cdn.modrinth.com/data/sampleProject/versions/sampleVersion/sample.jar"]}]})).unwrap();let s=content::scan(&b,&i.id).unwrap();assert_eq!(s.items[0].source,"pack");assert_eq!(s.items[0].project.as_deref(),Some("sampleProject"));content::mutate(&b,&i.id,&[s.items[0].id.clone()],"disable").unwrap();assert!(content::load(&root).unwrap().suppressed_pack_paths.contains(&"mods/sample.jar".into()));}
#[test]fn same_size_external_changes_are_detected(){let(b,_cleanup,i)=setup();let jar=b.root.join("sample.jar");fabric(&jar);let s=content_provider::import(&b,&i.id,vec![jar.to_string_lossy().into()],None).unwrap();let root=storage::instance_dir(&b.root,&i.id).unwrap();let mut bytes=crate::backend::protected_fs::read(root.join("mods/sample.jar")).unwrap();let end=bytes.len()-1;bytes[end]^=1;crate::backend::protected_fs::write(root.join("mods/sample.jar"),bytes).unwrap();let new=content::scan(&b,&i.id).unwrap();assert_ne!(new.items[0].hash,s.items[0].hash);}
#[tokio::test]
#[ignore="Downloads real compatible Modrinth content into a disposable instance"]
async fn real_content_install(){let(b,_cleanup,i)=setup();let root=storage::instance_dir(&b.root,&i.id).unwrap();let job=Arc::new(download::Job::new(&i.id,None,Arc::new(AtomicBool::new(false))));let plan=content_provider::preview(&b,&i,"iris",None,"mod",None,false).await.unwrap();assert!(plan.items.iter().any(|p|p.name.to_lowercase().contains("sodium")),"Required Sodium dependency should be resolved");let state=content_provider::install(b.clone(),&i.id,plan.clone(),job.clone()).await.unwrap();assert!(state.items.len()>=2);for item in &state.items{assert_eq!(item.hash,download::hash(&root.join(&item.path),"sha512").unwrap());}let count=state.items.len();assert_eq!(content_provider::install(b.clone(),&i.id,plan,job.clone()).await.unwrap().items.len(),count);let ids=state.items.iter().map(|i|i.id.clone()).collect::<Vec<_>>();content::mutate(&b,&i.id,&ids,"disable").unwrap();content::mutate(&b,&i.id,&ids,"enable").unwrap();content::mutate(&b,&i.id,&ids,"remove").unwrap();assert!(content::scan(&b,&i.id).unwrap().items.is_empty());assert_eq!(content::rollback(&b,&i.id).unwrap().items.len(),count);let restored=Backend::with_root(b.root.clone()).unwrap();assert_eq!(content::scan(&restored,&i.id).unwrap().items.len(),count);let latest=content_provider::updates(&restored,&i.id,false).await.unwrap();assert!(latest.items.iter().all(|i|i.update.is_none()));let incompatible=content_provider::preview(&b,&i,"embeddium",None,"mod",None,false).await.err().expect("Forge/NeoForge-only mod must be blocked");assert_eq!(incompatible.code,"content_incompatible");
 let versions=content_provider::versions(&b,&i,"iris","mod",false).await.unwrap();if let Some(previous)=versions.get(1){let prior_id=previous["id"].as_str().unwrap();let plan=content_provider::preview(&b,&i,"iris",Some(prior_id),"mod",None,false).await.unwrap();let previous=content_provider::install(b.clone(),&i.id,plan,job.clone()).await.unwrap();assert_eq!(previous.items.iter().filter(|x|x.name.to_lowercase().contains("iris")).count(),1);let updates=content_provider::updates(&b,&i.id,false).await.unwrap();let iris=updates.items.iter().find(|x|x.name.to_lowercase().contains("iris")).unwrap();assert!(iris.update.is_some());let newest=content_provider::preview(&b,&i,iris.project.as_deref().unwrap(),iris.update.as_deref(),"mod",None,false).await.unwrap();content_provider::install(b.clone(),&i.id,newest,job.clone()).await.unwrap();let rolled=content::rollback(&b,&i.id).unwrap();assert_eq!(rolled.items.iter().find(|x|x.name.to_lowercase().contains("iris")).unwrap().provider_version.as_deref(),Some(prior_id));}
 let world=root.join("saves/QA World");crate::backend::protected_fs::create_dir_all(&world).unwrap();crate::backend::protected_fs::write(world.join("level.dat"),b"isolated world marker").unwrap();
 for (project,kind,world) in [("complementary-unbound","shader",None),("better-leaves","resourcepack",None),("terralith","datapack",Some("QA World".into()))]{let plan=content_provider::preview(&b,&i,project,None,kind,world,false).await.unwrap();let s=content_provider::install(b.clone(),&i.id,plan,job.clone()).await.unwrap();assert!(s.items.iter().any(|x|x.kind==kind));}
 let all=content::scan(&b,&i.id).unwrap();for item in &all.items{assert_eq!(item.hash,download::hash(&root.join(content::location(item)),"sha512").unwrap());}let ids=all.items.iter().map(|x|x.id.clone()).collect::<Vec<_>>();content::mutate(&b,&i.id,&ids,"disable").unwrap();content::mutate(&b,&i.id,&ids,"enable").unwrap();content::mutate(&b,&i.id,&ids,"remove").unwrap();assert!(content::scan(&b,&i.id).unwrap().items.is_empty());assert_eq!(content::rollback(&b,&i.id).unwrap().items.len(),all.items.len());assert!(world.join("level.dat").is_file());
 println!("REAL_MODS_DEPENDENCIES_SHADER_RESOURCEPACK_DATAPACK_UPDATE_DUPLICATE_TOGGLE_REMOVE_ROLLBACK_PERSISTENCE_VERIFIED");}
#[test]fn failed_apply_restores_all_original_files(){let(b,_cleanup,i)=setup();let jar=b.root.join("sample.jar");fabric(&jar);let state=content_provider::import(&b,&i.id,vec![jar.to_string_lossy().into()],None).unwrap();let old=state.items[0].clone();let mut next=old.clone();next.id=uuid::Uuid::new_v4().to_string();next.project=Some("sample".into());next.path="mods/replacement.jar".into();let mut state=state;state.items[0].project=Some("sample".into());content::save(&storage::instance_dir(&b.root,&i.id).unwrap(),&state).unwrap();assert!(content_provider::apply(&b,&i.id,state,vec![(next,PathBuf::from("missing-staged-file"))]).is_err());let root=storage::instance_dir(&b.root,&i.id).unwrap();assert_eq!(download::hash(&root.join(&old.path),"sha512").unwrap(),old.hash);assert!(!root.join("mods/replacement.jar").exists());}

#[test]fn rollback_preserves_new_external_manual_files(){let(b,_cleanup,i)=setup();let jar=b.root.join("sample.jar");fabric(&jar);content_provider::import(&b,&i.id,vec![jar.to_string_lossy().into()],None).unwrap();let root=storage::instance_dir(&b.root,&i.id).unwrap();fabric(&root.join("mods/external.jar"));content::scan(&b,&i.id).unwrap();let state=content::rollback(&b,&i.id).unwrap();assert!(root.join("mods/external.jar").is_file());assert!(!root.join("mods/sample.jar").exists());assert_eq!(state.items.len(),1);assert!(!state.items[0].canary_managed);}
#[test]fn partial_update_rolls_back_a_replaced_same_filename(){let(b,_cleanup,i)=setup();let jar=b.root.join("sample.jar");fabric(&jar);let mut state=content_provider::import(&b,&i.id,vec![jar.to_string_lossy().into()],None).unwrap();state.items[0].project=Some("sample".into());let old=state.items[0].clone();let root=storage::instance_dir(&b.root,&i.id).unwrap();content::save(&root,&state).unwrap();let staged=b.root.join("new.jar");archive(&staged,&[("fabric.mod.json",br#"{"id":"sample","version":"2","name":"Sample mod"}"#)]);let mut item=old.clone();item.id=uuid::Uuid::new_v4().to_string();item.version="2".into();item.hash=download::hash(&staged,"sha512").unwrap();item.size=std::fs::metadata(&staged).unwrap().len();let mut second=item.clone();second.id=uuid::Uuid::new_v4().to_string();second.project=Some("other".into());second.path="mods/other.jar".into();let result=content_provider::apply(&b,&i.id,state,vec![(item,staged),(second,b.root.join("missing-file.jar"))]);assert!(result.is_err());assert_eq!(download::hash(&root.join("mods/sample.jar"),"sha512").unwrap(),old.hash);assert_eq!(content::load(&root).unwrap().items[0].version,"1.0");assert!(!root.join("mods/other.jar").exists());}

#[test]fn local_datapack_can_be_added_to_different_worlds(){let(b,_cleanup,i)=setup();let pack=b.root.join("datapack.zip");archive(&pack,&[("pack.mcmeta",br#"{"pack":{"pack_format":48}}"#),("data/sample/function/test.mcfunction",b"say test")]);let root=storage::instance_dir(&b.root,&i.id).unwrap();for name in ["A","B"]{let world=root.join("saves").join(name);crate::backend::protected_fs::create_dir_all(&world).unwrap();crate::backend::protected_fs::write(world.join("level.dat"),b"world fixture").unwrap();content_provider::import(&b,&i.id,vec![pack.to_string_lossy().into()],Some(name.into())).unwrap();}assert_eq!(content::scan(&b,&i.id).unwrap().items.len(),2);assert!(content_provider::import(&b,&i.id,vec![pack.to_string_lossy().into()],Some("A".into())).is_err());}
#[test]fn cancelled_local_import_never_applies_files(){let(b,_cleanup,i)=setup();let jar=b.root.join("sample.jar");fabric(&jar);let job=download::Job::new(&i.id,None,Arc::new(AtomicBool::new(true)));let error=content_provider::import_with_job(&b,&i.id,vec![jar.to_string_lossy().into()],None,Some(&job)).err().unwrap();assert_eq!(error.code,"cancelled");assert!(content::scan(&b,&i.id).unwrap().items.is_empty());assert!(jar.is_file());}

#[test]fn manually_replaced_pack_file_keeps_local_provenance(){let(b,_cleanup,i)=setup();let root=storage::instance_dir(&b.root,&i.id).unwrap();fabric(&root.join("mods/sample.jar"));storage::write_json(&root.join("modrinth.index.json"),&json!({"files":[{"path":"mods/sample.jar","hashes":{"sha512":"0".repeat(128)}}]})).unwrap();let state=content::scan(&b,&i.id).unwrap();assert_eq!(state.items[0].source,"local");assert!(state.suppressed_pack_paths.contains(&"mods/sample.jar".into()));}

fn staged_pack(b:&Backend,i:&Instance)->PathBuf {let path=b.root.join("new-pack");archive(&path.join("mods/sample.jar"),&[("fabric.mod.json",br#"{"id":"sample","name":"Sample mod","version":"2","depends":{"minecraft":"1.21.1"}}"#)]);storage::write_json(&path.join("modrinth.index.json"),&json!({"formatVersion":1,"game":"minecraft","files":[{"path":"mods/sample.jar","hashes":{"sha512":download::hash(&path.join("mods/sample.jar"),"sha512").unwrap()}}]})).unwrap();storage::write_json(&path.join("canary-instance.json"),&json!({"project_id":i.project_id,"version_id":"new-version","pack_version":"2","dependencies":{"minecraft":"1.21.1","fabric-loader":"0.16.10"}})).unwrap();crate::backend::protected_fs::create_dir_all(path.join("config")).unwrap();crate::backend::protected_fs::write(path.join("config/existing.txt"),b"new pack defaults").unwrap();crate::backend::protected_fs::write(path.join("config/new.txt"),b"new setting").unwrap();path}
#[test]fn pack_update_preserves_user_content_configuration_worlds_and_rolls_back(){let(b,_cleanup,mut i)=setup();i.provider="modrinth".into();i.project_id=Some("test-project".into());i.version_id=Some("old-version".into());i.version_name="1".into();i.loader_version=Some("0.16.10".into());b.save_instance(&i).unwrap();let root=storage::instance_dir(&b.root,&i.id).unwrap();fabric(&root.join("mods/sample.jar"));let original_hash=download::hash(&root.join("mods/sample.jar"),"sha512").unwrap();storage::write_json(&root.join("modrinth.index.json"),&json!({"files":[{"path":"mods/sample.jar","hashes":{"sha512":original_hash}}]})).unwrap();archive(&root.join("mods/user.jar"),&[("fabric.mod.json",br#"{"id":"user","name":"User mod","version":"1"}"#)]);let user_hash=download::hash(&root.join("mods/user.jar"),"sha512").unwrap();crate::backend::protected_fs::create_dir_all(root.join("config")).unwrap();crate::backend::protected_fs::write(root.join("config/existing.txt"),b"user settings").unwrap();crate::backend::protected_fs::create_dir_all(root.join("saves/World")).unwrap();crate::backend::protected_fs::write(root.join("saves/World/level.dat"),b"world fixture").unwrap();storage::write_json(&root.join("runtime.json"),&json!({"previous":"runtime"})).unwrap();let stage=staged_pack(&b,&i);let updated=super::pack_update::apply_staged(&b,&i.id,&stage,"new-version").unwrap();assert_eq!(updated.items.len(),2);assert_eq!(b.instance(&i.id).unwrap().version_id.as_deref(),Some("new-version"));assert_eq!(download::hash(&root.join("mods/user.jar"),"sha512").unwrap(),user_hash);assert_eq!(crate::backend::protected_fs::read(root.join("config/existing.txt")).unwrap(),b"user settings");assert!(root.join("config/new.txt").is_file());assert!(!root.join("runtime.json").exists());assert!(!updated.suppressed_pack_paths.contains(&"mods/sample.jar".into()));content::rollback(&b,&i.id).unwrap();assert_eq!(b.instance(&i.id).unwrap().version_id.as_deref(),Some("old-version"));assert_eq!(download::hash(&root.join("mods/sample.jar"),"sha512").unwrap(),original_hash);assert_eq!(download::hash(&root.join("mods/user.jar"),"sha512").unwrap(),user_hash);assert_eq!(crate::backend::protected_fs::read(root.join("saves/World/level.dat")).unwrap(),b"world fixture");assert!(root.join("runtime.json").is_file());assert!(!root.join("config/new.txt").exists());}
#[test]fn pack_update_blocks_conflicting_user_file_without_changing_it(){let(b,_cleanup,mut i)=setup();i.provider="modrinth".into();i.project_id=Some("test-project".into());i.version_id=Some("old-version".into());b.save_instance(&i).unwrap();let root=storage::instance_dir(&b.root,&i.id).unwrap();fabric(&root.join("mods/sample.jar"));let original=download::hash(&root.join("mods/sample.jar"),"sha512").unwrap();let stage=staged_pack(&b,&i);assert_eq!(super::pack_update::apply_staged(&b,&i.id,&stage,"new-version").err().unwrap().code,"content_conflict");assert_eq!(download::hash(&root.join("mods/sample.jar"),"sha512").unwrap(),original);assert_eq!(b.instance(&i.id).unwrap().version_id.as_deref(),Some("old-version"));assert!(content::load(&root).unwrap().snapshots.is_empty());}

#[tokio::test]
#[ignore="Downloads two real Modrinth pack versions and checks safe update/rollback in a disposable instance"]
async fn real_pack_update_preserves_additions(){let(b,_cleanup,mut i)=setup();let data=download::json(&b,"https://api.modrinth.com/v2/project/1KVo5zza/version?game_versions=%5B%221.21.1%22%5D&loaders=%5B%22fabric%22%5D").await.unwrap();let releases=data.as_array().unwrap().iter().filter(|v|v["version_type"]=="release").collect::<Vec<_>>();assert!(releases.len()>=2);let older=releases[1]["id"].as_str().unwrap();let installed=crate::installer::install("1KVo5zza",older,"Pack update QA",&b.root.join("pack-source"),|_|{}).await.unwrap();let root=storage::instance_dir(&b.root,&i.id).unwrap();crate::backend::protected_fs::rename(&root,b.root.join("initial-empty-instance-record")).unwrap();crate::backend::protected_fs::rename(installed,&root).unwrap();let legacy:serde_json::Value=serde_json::from_slice(&crate::backend::protected_fs::read(root.join("canary-instance.json")).unwrap()).unwrap();i.provider="modrinth".into();i.project_id=Some("1KVo5zza".into());i.version_id=Some(older.into());i.version_name=legacy["pack_version"].as_str().unwrap().into();i.loader_version=legacy["dependencies"]["fabric-loader"].as_str().map(str::to_owned);b.save_instance(&i).unwrap();archive(&root.join("mods/user-addon.jar"),&[("fabric.mod.json",br#"{"id":"canary_qa_user_addition","name":"QA user addition","version":"1"}"#)]);let user_hash=download::hash(&root.join("mods/user-addon.jar"),"sha512").unwrap();crate::backend::protected_fs::create_dir_all(root.join("config")).unwrap();crate::backend::protected_fs::write(root.join("config/user-check.txt"),b"user config preserved").unwrap();crate::backend::protected_fs::create_dir_all(root.join("saves/QA World")).unwrap();crate::backend::protected_fs::write(root.join("saves/QA World/level.dat"),b"isolated world marker").unwrap();let before=content::scan(&b,&i.id).unwrap();let hashes=before.items.iter().map(|x|(x.path.clone(),x.hash.clone())).collect::<Vec<_>>();let preview=super::pack_update::preview(&b,&i.id,false).await.unwrap();let job=Arc::new(download::Job::new(&i.id,None,Arc::new(AtomicBool::new(false))));super::pack_update::install(b.clone(),&i.id,false,&preview.fingerprint,job).await.unwrap();assert_eq!(b.instance(&i.id).unwrap().version_id.as_deref(),Some(preview.version.as_str()));assert_eq!(download::hash(&root.join("mods/user-addon.jar"),"sha512").unwrap(),user_hash);assert_eq!(crate::backend::protected_fs::read(root.join("config/user-check.txt")).unwrap(),b"user config preserved");assert!(root.join("saves/QA World/level.dat").is_file());let reload=Backend::with_root(b.root.clone()).unwrap();content::rollback(&reload,&i.id).unwrap();assert_eq!(reload.instance(&i.id).unwrap().version_id.as_deref(),Some(older));for(path,hash)in hashes{assert_eq!(download::hash(&root.join(path),"sha512").unwrap(),hash);}println!("REAL_MODRINTH_PACK_UPDATE_USER_CONTENT_CONFIG_WORLD_PERSISTENCE_ROLLBACK_VERIFIED");}

// UI availability filters must bypass providers before touching their API.
#[tokio::test]
async fn unavailable_provider_update_filter_preserves_content_without_api_access() {
    let (b, _cleanup, mut instance) = setup();
    instance.provider = "curseforge".into();
    instance.project_id = Some("100".into());
    b.save_instance(&instance).unwrap();
    let allowed = vec!["modrinth".to_owned()];
    let packs = super::modpacks::updates_for_providers(b.clone(), Some(&allowed)).await.unwrap();
    assert!(packs.as_array().unwrap().is_empty());
    let root = b.instance_path(&instance.id).unwrap();
    fabric(&root.join("mods/sample.jar"));
    let mut state = content::scan(&b, &instance.id).unwrap();
    assert_eq!(state.items.len(), 1);
    state.items[0].provider = "curseforge".into();
    state.items[0].project = Some("300".into());
    state.items[0].update = Some("400".into());
    content::save(&root, &state).unwrap();
    let result = content_provider::updates_for_providers(&b, &instance.id, false, Some(&allowed)).await.unwrap();
    assert_eq!(result.items.len(), 1);
    assert_eq!(result.items[0].provider, "curseforge");
    assert!(result.items[0].update.is_none());
    assert!(root.join("mods/sample.jar").exists());
}
