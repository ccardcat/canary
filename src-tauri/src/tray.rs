use std::sync::Arc;
use tauri::{AppHandle,Emitter,Manager,menu::{Menu,MenuItem},tray::{MouseButton,MouseButtonState,TrayIconBuilder,TrayIconEvent}};
use crate::backend::{Backend,model::BackendError};
#[derive(Default)]pub struct TrayState{pub hidden:std::sync::atomic::AtomicBool}
fn show(app:&AppHandle){app.state::<TrayState>().hidden.store(false,std::sync::atomic::Ordering::Release);if let Some(window)=app.get_webview_window("main"){let _=window.unminimize();let _=window.show();let _=window.set_focus();}}
fn menu(app:&AppHandle,russian:bool)->tauri::Result<Menu<tauri::Wry>>{let show=MenuItem::with_id(app,"show",if russian{"Открыть Canary"}else{"Open Canary"},true,None::<&str>)?;let quit=MenuItem::with_id(app,"quit",if russian{"Выйти"}else{"Quit"},true,None::<&str>)?;Menu::with_items(app,&[&show,&quit])}
pub fn install(app:&AppHandle)->tauri::Result<()>{
    let mut builder=TrayIconBuilder::with_id("canary").tooltip("Canary").menu(&menu(app,true)?).show_menu_on_left_click(false);
    if let Some(icon)=app.default_window_icon(){builder=builder.icon(icon.clone());}
    builder.on_tray_icon_event(|tray,event|{if matches!(event,TrayIconEvent::Click{button:MouseButton::Left,button_state:MouseButtonState::Up,..}){show(tray.app_handle());}})
    .on_menu_event(|app,event|match event.id.as_ref(){"show"=>show(app),"quit"=>{let b=app.state::<Arc<Backend>>();if !b.jobs.lock().unwrap().is_empty()||!b.processes.lock().unwrap().is_empty(){show(app);let _=app.emit("backend-error",BackendError::new("tasks_running","Stop Minecraft and finish or cancel operations before quitting Canary"));}else{app.exit(0);}},_=>{}}).build(app)?;Ok(())
}
#[tauri::command]pub fn hide_to_tray(app:AppHandle)->Result<(),String>{if app.tray_by_id("canary").is_none(){return Err("Canary tray icon is unavailable".into());}let window=app.get_webview_window("main").ok_or("Main window unavailable")?;window.hide().map_err(|e|e.to_string())?;app.state::<TrayState>().hidden.store(true,std::sync::atomic::Ordering::Release);Ok(())}
#[tauri::command]pub fn set_tray_language(app:AppHandle,russian:bool)->Result<(),String>{if let Some(tray)=app.tray_by_id("canary"){tray.set_menu(Some(menu(&app,russian).map_err(|e|e.to_string())?)).map_err(|e|e.to_string())?;}Ok(())}
