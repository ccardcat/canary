//! Declared mod requirements only: unknown predicates never become a false rejection.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cmp::Ordering;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Issue {
    pub reason: String,
    pub name: String,
    pub required: String,
    pub actual: String,
    pub dependency: String,
    pub other: String,
}
impl Issue {
    pub fn new(reason: &str, name: &str, required: &str, actual: &str) -> Self {
        Self { reason: reason.into(), name: name.into(), required: required.into(), actual: actual.into(), dependency: String::new(), other: String::new() }
    }
    pub fn message(&self) -> String {
        match self.reason.as_str() {
            "minecraft" | "loader" | "loader_version" => format!("{} requires {}; this instance uses {}", self.name, self.required, self.actual),
            "server_only" => format!("{} is a server-only mod and cannot run in this client instance", self.name),
            "dependency_missing" => format!("{} requires {} {}; this dependency is not installed or enabled", self.name, self.dependency, self.required),
            "dependency_version" => format!("{} requires {} {}; installed: {} {}", self.name, self.dependency, self.required, self.other, self.actual),
            "conflict" | "duplicate" => format!("{} conflicts with {} {} ({})", self.name, self.other, self.actual, self.dependency),
            _ => format!("{}: required {}; actual {}", self.name, self.required, self.actual),
        }
    }
}

#[derive(Clone, Debug)]
pub struct Rule { pub id: String, pub versions: Value, pub optional: bool, pub breaks: bool, pub maven: bool }
#[derive(Clone, Debug, Default)]
pub struct Metadata { pub id: String, pub name: String, pub version: String, pub aliases: Vec<(String, String)>, pub rules: Vec<Rule>, pub server_only: bool }

fn label(value: &Value) -> String {
    if let Some(s) = value.as_str() { s.to_owned() } else { value.to_string() }
}
pub fn fabric(value: &Value) -> Metadata {
    let id = value["id"].as_str().unwrap_or("").to_owned();
    let mut meta = Metadata { name: value["name"].as_str().unwrap_or(&id).into(), version: value["version"].as_str().unwrap_or("").into(), id, server_only: value["environment"] == "server", ..Metadata::default() };
    for alias in value["provides"].as_array().into_iter().flatten().filter_map(Value::as_str) { meta.aliases.push((alias.into(), meta.version.clone())); }
    for (key, breaks) in [("depends", false), ("breaks", true)] {
        for (id, versions) in value[key].as_object().into_iter().flatten() {
            meta.rules.push(Rule { id: id.clone(), versions: versions.clone(), optional: false, breaks, maven: false });
        }
    }
    meta
}
pub fn quilt(value: &Value) -> Metadata {
    let v = &value["quilt_loader"];
    let id = v["id"].as_str().unwrap_or("").to_owned();
    let mut meta = Metadata { name: v["metadata"]["name"].as_str().unwrap_or(&id).into(), version: v["version"].as_str().unwrap_or("").into(), id, server_only: value["minecraft"]["environment"] == "server", ..Metadata::default() };
    for alias in v["provides"].as_array().into_iter().flatten() {
        if let Some(id) = alias.as_str().or_else(|| alias["id"].as_str()) { meta.aliases.push((id.into(), alias["version"].as_str().unwrap_or(&meta.version).into())); }
    }
    for (key, breaks) in [("depends", false), ("breaks", true)] {
        for dep in v[key].as_array().into_iter().flatten() {
            // Alternative dependency groups and conditional 'unless' require
            // Quilt's solver; leave them to the loader rather than guess.
            if dep.is_array() || !dep["unless"].is_null() { continue; }
            if let Some(id) = dep.as_str().or_else(|| dep["id"].as_str()) {
                let versions = if dep["versions"].is_null() { json!("*") } else { dep["versions"].clone() };
                meta.rules.push(Rule { id: id.rsplit(':').next().unwrap_or(id).into(), versions, optional: dep["optional"] == true, breaks, maven: false });
            }
        }
    }
    meta
}
pub fn forge(value: &Value, jar_version: &str) -> Vec<Metadata> {
    value["mods"].as_array().into_iter().flatten().filter_map(|entry| {
        let id = entry["modId"].as_str()?;
        let version = entry["version"].as_str().unwrap_or("");
        let mut meta = Metadata { id: id.into(), name: entry["displayName"].as_str().unwrap_or(id).into(), version: if version == "${file.jarVersion}" { jar_version.into() } else { version.into() }, ..Metadata::default() };
        for dep in value["dependencies"][id].as_array().into_iter().flatten() {
            if dep["side"] == "SERVER" { continue; }
            let Some(id) = dep["modId"].as_str() else { continue; };
            let kind = dep["type"].as_str().unwrap_or(if dep["mandatory"] == false { "optional" } else { "required" }).to_ascii_lowercase();
            if kind == "discouraged" { continue; }
            meta.rules.push(Rule { id: id.into(), versions: json!(dep["versionRange"].as_str().unwrap_or("")), optional: kind == "optional", breaks: kind == "incompatible", maven: true });
        }
        Some(meta)
    }).collect()
}

#[derive(Debug)]
struct Version { numbers: Vec<u64>, pre: Option<String> }
fn version(raw: &str) -> Option<Version> {
    if raw.contains("${") || raw.is_empty() { return None; }
    let raw = raw.split('+').next()?;
    let (number, pre) = raw.split_once('-').map_or((raw, None), |(n, p)| (n, Some(p.to_owned())));
    let numbers = number.split('.').map(str::parse).collect::<Result<Vec<u64>, _>>().ok()?;
    if numbers.is_empty() || numbers.len() > 16 || pre.as_ref().is_some_and(|p| !p.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'))) { return None; }
    Some(Version { numbers, pre })
}
fn compare(a: &Version, b: &Version) -> Ordering {
    for n in 0..a.numbers.len().max(b.numbers.len()) { let order = a.numbers.get(n).unwrap_or(&0).cmp(b.numbers.get(n).unwrap_or(&0)); if order != Ordering::Equal { return order; } }
    match (&a.pre, &b.pre) {
        (None, None) => Ordering::Equal, (None, Some(_)) => Ordering::Greater, (Some(_), None) => Ordering::Less,
        (Some(a), Some(b)) => {
            if a.is_empty() || b.is_empty() { return a.cmp(b); }
            let mut aa = a.split('.'); let mut bb = b.split('.');
            loop { match (aa.next(), bb.next()) {
                (None, None) => return Ordering::Equal, (None, Some(_)) => return Ordering::Less, (Some(_), None) => return Ordering::Greater,
                (Some(a), Some(b)) => { let order = match (a.parse::<u64>(), b.parse::<u64>()) { (Ok(a), Ok(b)) => a.cmp(&b), (Ok(_), Err(_)) => Ordering::Less, (Err(_), Ok(_)) => Ordering::Greater, _ => a.cmp(b) }; if order != Ordering::Equal { return order; } }
            } }
        }
    }
}
fn all(values: impl Iterator<Item = Option<bool>>) -> Option<bool> { let mut unknown = false; for v in values { match v { Some(false) => return Some(false), None => unknown = true, _ => {} } } if unknown { None } else { Some(true) } }
fn any(values: impl Iterator<Item = Option<bool>>) -> Option<bool> { let mut unknown = false; for v in values { match v { Some(true) => return Some(true), None => unknown = true, _ => {} } } if unknown { None } else { Some(false) } }
pub fn matches(actual: &str, spec: &Value, maven: bool) -> Option<bool> { matches_inner(actual, spec, maven, 0) }
fn matches_inner(actual: &str, spec: &Value, maven: bool, depth: usize) -> Option<bool> {
    if depth > 16 { return None; }
    if let Some(list) = spec.as_array() { return any(list.iter().map(|v| matches_inner(actual, v, maven, depth + 1))); }
    if let Some(list) = spec["any"].as_array() { return any(list.iter().map(|v| matches_inner(actual, v, maven, depth + 1))); }
    if let Some(list) = spec["all"].as_array() { return all(list.iter().map(|v| matches_inner(actual, v, maven, depth + 1))); }
    let s = spec.as_str()?.trim();
    if s == "*" || (maven && s.is_empty()) { return Some(true); }
    if s.is_empty() { return None; }
    if actual == s || s.strip_prefix('=').is_some_and(|s| actual == s) { return Some(true); }
    if maven { return maven_matches(actual, s); }
    let tokens = s.split_whitespace().collect::<Vec<_>>();
    all(tokens.iter().map(|token| predicate(actual, token)))
}
fn predicate(actual: &str, s: &str) -> Option<bool> {
    if s == "*" { return Some(true); }
    let (op, raw) = [">=", "<=", ">", "<", "=", "~", "^"].iter().find_map(|op| s.strip_prefix(op).map(|v| (*op, v))).unwrap_or(("=", s));
    if raw.contains(['*', 'x', 'X']) {
        if op != "=" || raw.contains('-') { return None; }
        let parts = raw.split('.').collect::<Vec<_>>();
        let prefix = parts.iter().position(|p| matches!(*p, "*" | "x" | "X"))?;
        if !parts[prefix..].iter().all(|p| matches!(*p, "*" | "x" | "X")) { return None; }
        let v = version(actual)?;
        let nums = parts[..prefix].iter().map(|p| p.parse::<u64>()).collect::<Result<Vec<_>, _>>().ok()?;
        return Some(nums.iter().enumerate().all(|(n, value)| *value == *v.numbers.get(n).unwrap_or(&0)));
    }
    let Some(a) = version(actual) else { return if op == "=" { Some(actual == raw) } else { None }; };
    let Some(b) = version(raw) else { return if op == "=" { Some(actual == raw) } else { None }; };
    let cmp = compare(&a, &b);
    Some(match op { "=" => cmp == Ordering::Equal, ">" => cmp == Ordering::Greater, ">=" => cmp != Ordering::Less, "<" => cmp == Ordering::Less, "<=" => cmp != Ordering::Greater,
        "~" | "^" => { let n = if op == "^" { 0 } else { 1.min(b.numbers.len() - 1) }; let mut upper = b.numbers[..=n].to_vec(); upper[n] = upper[n].checked_add(1)?; cmp != Ordering::Less && compare(&a, &Version { numbers: upper, pre: Some(String::new()) }) == Ordering::Less }, _ => return None })
}
fn maven_matches(actual: &str, spec: &str) -> Option<bool> {
    if !spec.starts_with(['[', '(']) { return None; } // A bare Maven version is a recommendation.
    let mut remaining = spec; let mut results = vec![];
    while !remaining.is_empty() {
        let end = remaining.find([']', ')'])?;
        let range = &remaining[..=end]; let inner = &range[1..range.len() - 1];
        if let Some((low, high)) = inner.split_once(',') {
            let a = version(actual)?;
            // Maven qualifier ordering differs from Fabric SemVer. Do not guess.
            if a.pre.is_some() { return None; }
            let low = low.trim(); let high = high.trim();
            let lower = if low.is_empty() { true } else { let b = version(low)?; if b.pre.is_some() { return None; } let c = compare(&a, &b); c == Ordering::Greater || range.starts_with('[') && c == Ordering::Equal };
            let upper = if high.is_empty() { true } else { let b = version(high)?; if b.pre.is_some() { return None; } let c = compare(&a, &b); c == Ordering::Less || range.ends_with(']') && c == Ordering::Equal };
            results.push(Some(lower && upper));
        } else if range.starts_with('[') && range.ends_with(']') { results.push(predicate(actual, inner)); } else { return None; }
        remaining = remaining[end + 1..].trim_start();
        if !remaining.is_empty() { remaining = remaining.strip_prefix(',')?.trim_start(); }
    }
    any(results.into_iter())
}
pub fn environment(meta: &Metadata, minecraft: &str, loader: &str, loader_version: Option<&str>) -> Option<Issue> {
    if meta.server_only { return Some(Issue::new("server_only", &meta.name, "client", "server")); }
    for r in &meta.rules {
        let (actual, reason) = match r.id.as_str() {
            "minecraft" => (Some(minecraft), "minecraft"),
            "fabricloader" if loader == "fabric" => (loader_version, "loader_version"),
            "quilt_loader" if loader == "quilt" => (loader_version, "loader_version"),
            "forge" if loader == "forge" => (loader_version.map(|v| v.strip_prefix(&format!("{minecraft}-")).unwrap_or(v)), "loader_version"),
            "neoforge" if loader == "neoforge" => (loader_version, "loader_version"),
            _ => continue,
        };
        if let Some(actual) = actual { if matches(actual, &r.versions, r.maven) == Some(r.breaks) {
            return Some(Issue::new(reason, &meta.name, &format!("{} {}", r.id, label(&r.versions)), actual));
        } }
    }
    None
}
// Incoming containers are checked fully. Existing mods are rechecked only for
// dependencies affected by this transaction, so unrelated old issues do not
// prevent someone from repairing their instance.
pub fn relationships(mods: &[Metadata], incoming: &[String], affected: &[String], builtins: &[&str]) -> Option<Issue> {
    for meta in mods {
        for r in &meta.rules {
            if builtins.contains(&r.id.as_str()) || (!incoming.contains(&meta.id) && !affected.contains(&r.id)) { continue; }
            let candidates = mods.iter().flat_map(|m| std::iter::once((&m.id, &m.version, &m.name)).chain(m.aliases.iter().map(move |(id, version)| (id, version, &m.name)))).filter(|(id, _, _)| *id == &r.id).collect::<Vec<_>>();
            if candidates.is_empty() {
                if !r.breaks && !r.optional { let mut issue = Issue::new("dependency_missing", &meta.name, &label(&r.versions), ""); issue.dependency = r.id.clone(); return Some(issue); }
                continue;
            }
            let compatible = any(candidates.iter().map(|(_, v, _)| if v.is_empty() || v.contains("${") { None } else { matches(v, &r.versions, r.maven) }));
            if compatible == Some(r.breaks) {
                let (_, v, name) = candidates[0]; let mut issue = Issue::new(if r.breaks { "conflict" } else { "dependency_version" }, &meta.name, &label(&r.versions), v); issue.dependency = r.id.clone(); issue.other = name.clone(); return Some(issue);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn fabric_ranges_and_alternatives_follow_loader_semantics() {
        for (actual, spec, result) in [("1.21.1", ">=1.21 <1.22", true), ("26.2", ">=1.21 <1.22", false), ("1.21.1", "1.21.x", true), ("1.22", "1.21.*", false), ("0.5", "^0.3", true), ("0.4", "~0.3", false), ("26.1", "26.1.0", true), ("1.2.3+mc1.21", "1.2.3", true), ("1.2-beta.2", ">1.2- <1.2", true)] { assert_eq!(matches(actual, &json!(spec), false), Some(result), "{actual} {spec}"); }
        assert_eq!(matches("1.21.1", &json!(["1.20.1", "1.21.1"]), false), Some(true));
        assert_eq!(matches("26.2", &json!({"all":[">=1.21", "<1.22"]}), false), Some(false));
        assert_eq!(matches("26w14a", &json!(">=26.1"), false), None);
    }
    #[test] fn maven_bounds_open_ranges_and_unions() {
        for (actual, range, yes) in [("1.21.1", "[1.21,1.22)", true), ("1.22", "[1.21,1.22)", false), ("21.1.9", "[21.1,)", true), ("1.21.1", "[1.21.1]", true), ("1.5", "(,1.0],[2.0,)", false), ("3", "(,1.0],[2.0,)", true)] { assert_eq!(matches(actual, &json!(range), true), Some(yes)); }
        assert_eq!(matches("1.0-beta", &json!("[1,2)"), true), None);
    }
    #[test] fn named_environment_errors_include_actual_and_required_versions() {
        let meta = fabric(&json!({"id":"test","name":"Example mod","version":"1","depends":{"minecraft":">=1.21 <1.22","fabricloader":">=0.16"}}));
        assert_eq!(environment(&meta,"26.2","fabric",Some("0.16.10")).unwrap().reason,"minecraft");
        assert_eq!(environment(&meta,"1.21.1","fabric",Some("0.15.0")).unwrap().reason,"loader_version");
        assert!(environment(&meta,"1.21.1","fabric",Some("0.16.10")).is_none());
    }
    #[test] fn dependencies_conflicts_reverse_updates_and_aliases() {
        let user = fabric(&json!({"id":"user","name":"User mod","depends":{"library":">=2"}}));
        let old = fabric(&json!({"id":"library","name":"Library","version":"1"}));
        let new = fabric(&json!({"id":"library","name":"Library","version":"2","provides":["library-alias"]}));
        assert_eq!(relationships(&[user.clone()],&["user".into()],&[],&[]).unwrap().reason,"dependency_missing");
        assert_eq!(relationships(&[user.clone(),old],&["library".into()],&["library".into()],&[]).unwrap().reason,"dependency_version");
        assert!(relationships(&[user.clone(),new.clone()],&["user".into()],&[],&[]).is_none());
        let bad=fabric(&json!({"id":"bad","name":"Bad mod","breaks":{"library-alias":">=2"}}));
        let issue=relationships(&[bad,new],&["bad".into()],&[],&[]).unwrap();assert_eq!(issue.reason,"conflict");assert_eq!(issue.other,"Library");
    }
    #[test] fn optional_server_only_and_unknown_dependencies_are_not_false_failures() {
        let values=json!({"mods":[{"modId":"test","displayName":"Forge test","version":"${file.jarVersion}"}],"dependencies":{"test":[{"modId":"serverdep","mandatory":true,"side":"SERVER","versionRange":"[1,)"},{"modId":"optional","type":"optional","versionRange":"[2,)"}]}});
        let meta=forge(&values,"1.2.3");assert_eq!(meta[0].version,"1.2.3");assert_eq!(meta[0].rules.len(),1);
        assert!(relationships(&meta,&["test".into()],&[],&[]).is_none());
        let q=quilt(&json!({"quilt_loader":{"id":"test","depends":[[{"id":"one"},{"id":"two"}],{"id":"minecraft","versions":{"all":[">=1.21","<1.22"]}}]}}));assert_eq!(q.rules.len(),1);
        assert_eq!(environment(&q,"26.2","quilt",None).unwrap().reason,"minecraft");
    }
}
