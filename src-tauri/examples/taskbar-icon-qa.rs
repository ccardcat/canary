// Native regression check: a hidden Tauri window with its real executable icon.
// No backend initialization, user profiles or launcher preferences.
#[cfg(windows)]
#[path = "../src/window_icon.rs"]
mod window_icon;

#[cfg(windows)]
fn main() {
    use std::{ffi::c_void, path::PathBuf};
    #[link(name = "user32")]
    extern "system" {
        fn SendMessageW(window: *mut c_void, message: u32, wparam: usize, lparam: isize) -> isize;
    }
    let report = std::env::args().nth(1).map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".qa/taskbar-icon/native-icon.json"));
    std::fs::create_dir_all(report.parent().unwrap()).unwrap();
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    let profile = std::fs::canonicalize(report.parent().unwrap()).unwrap().join("webview");
    tauri::Builder::default().setup(move |app| {
        let window = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External("about:blank".parse().unwrap()))
            .title("Canary icon QA").visible(false).decorations(false).data_directory(profile.clone()).build()?;
        let hwnd = window.hwnd()?.0;
        let read = |kind| unsafe { SendMessageW(hwnd, 0x7f, kind, 0) };
        let small_before = read(0);
        let big_before = read(1);
        window_icon::apply(&window)?;
        let small_after = read(0);
        let big_after = read(1);
        assert_ne!(small_after, 0, "Titlebar icon is present");
        assert_eq!(small_before, small_after, "Titlebar icon remains intact");
        assert_ne!(big_after, 0, "Taskbar has a native ICON_BIG");
        // The shared resource must stay valid beyond the setter call.
        let resource = tauri::image::Image::from_app_icon_resource(32)?;
        assert!(resource.rgba().chunks_exact(4).any(|pixel| pixel[3] != 0));
        window_icon::apply(&window)?;
        assert_eq!(big_after, read(1), "Repeated initialization reuses the shared icon");
        std::fs::write(&report, serde_json::to_vec_pretty(&serde_json::json!({
            "status":"success", "smallBefore":small_before, "smallAfter":small_after,
            "bigBefore":big_before, "bigAfter":big_after,
            "resourceWidth":resource.width(), "resourceHeight":resource.height()
        }))?)?;
        let handle = app.handle().clone();
        std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_millis(250)); handle.exit(0); });
        Ok(())
    }).run(context).expect("Native taskbar icon check failed");
}

#[cfg(not(windows))]
fn main() { println!("Native taskbar icon check requires Windows"); }
