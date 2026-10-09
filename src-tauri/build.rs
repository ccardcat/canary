include!("src/app_commands.rs");
fn main() {
    println!("cargo:rerun-if-env-changed=CANARY_CURSEFORGE_PROXY_URL");
    let windows = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows");
    let attributes = if windows {
        // The linker embeds the same Common Controls dependency for every target.
        // Do not also embed resource ID 1 through Tauri's resource.lib: MSVC
        // rejects the duplicate manifest when linking the main desktop executable.
        tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new_without_app_manifest(),
        )
    } else {
        tauri_build::Attributes::new()
    };
    tauri_build::try_build(attributes.app_manifest(tauri_build::AppManifest::new().commands(COMMANDS))).expect("Failed to generate Tauri resources");
    // Tauri links the icon resource to binaries, but the hidden native icon
    // regression check is a Cargo example and needs the same resource explicitly.
    if windows && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        let resource = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("resource.lib");
        println!("cargo:rustc-link-arg-examples={}", resource.display());
    }
    // Native file dialogs import TaskDialogIndirect. Test/utility executables
    // also need Common Controls v6, not just Tauri's resource-bearing main EXE.
    if windows {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
    }
}
