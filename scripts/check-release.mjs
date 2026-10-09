import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const {version}=JSON.parse(read('package.json'));
const tauri=JSON.parse(read('src-tauri/tauri.conf.json'));
const cargo=read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
assert.equal(tauri.version,version,'Tauri and npm release versions must match');
assert.equal(cargo,version,'Cargo and npm release versions must match');
assert.ok(read('docs/RELEASE.md').includes(`**${version}**`),'Update release notes for the current version');
console.log(`Release metadata is consistent: ${version}`);
