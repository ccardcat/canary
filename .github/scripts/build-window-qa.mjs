import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Build the same application with Tauri's supported release inspector feature.
// Production installers have already been generated without this feature.
if (process.platform !== 'win32') throw Error('Windows native QA build only');
const folder = resolve('qa/windows-window-smoke');
await mkdir(folder, { recursive: true });
const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
config.app.windows[0].devtools = true;
// ACL probes clone these options so every WebView shares one compatible environment.
config.app.windows[0].additionalBrowserArgs = '--remote-debugging-port=9384 --remote-debugging-address=127.0.0.1';
config.app.windows[0].dataDirectory = resolve(folder, 'webview-profile');
const path = resolve(folder, 'inspector-config.json');
await writeFile(path, JSON.stringify(config));
const build = spawnSync(process.execPath, [resolve('node_modules/@tauri-apps/cli/tauri.js'), 'build', '--ci', '--no-bundle', '--features', 'native-qa', '--config', path, '--', '--locked'], { stdio: 'inherit' });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
await copyFile('src-tauri/target/release/scaffold.exe', resolve(folder, 'canary-native-qa.exe'));
