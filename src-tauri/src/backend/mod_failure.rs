//! Keep the loader's own explanation, never infer a mod conflict from an exit code.
#[derive(Default)]
pub struct Explanation { lines: Vec<String>, bytes: usize, collecting: bool }
impl Explanation {
    pub fn push(&mut self, line: &str) {
        let lower = line.to_ascii_lowercase();
        let marker = ["incompatible mods found", "incompatible mod set", "mod resolution encountered", "missing or unsupported mandatory dependencies", "modloadingexception", "loading errors encountered"].iter().any(|marker| lower.contains(marker));
        if marker { self.collecting = true; }
        if !self.collecting || self.lines.len() >= 24 || self.bytes >= 6144 { return; }
        let line = line.trim();
        if line.is_empty() || line.starts_with("at ") || line.contains("\tat ") { return; }
        let safe: String = line.chars().take(1024).collect();
        if self.bytes + safe.len() > 6144 { return; }
        self.bytes += safe.len(); self.lines.push(safe);
    }
    pub fn message(&self) -> Option<String> { if self.lines.is_empty() { None } else { Some(self.lines.join("\n")) } }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn loader_explanation_keeps_mod_names_and_required_versions() {
        let mut explanation = Explanation::default();
        explanation.push("[main/ERROR]: Incompatible mods found!");
        explanation.push(" - Mod 'Iris' (iris) 1.8 requires version 0.6 of mod 'Sodium' (sodium), but only 0.5 is present!");
        explanation.push("\tat net.fabricmc.loader.example");
        let message = explanation.message().unwrap(); assert!(message.contains("Iris")); assert!(message.contains("Sodium")); assert!(message.contains("0.6")); assert!(!message.contains("net.fabricmc"));
    }
    #[test] fn ordinary_crash_or_exit_code_is_not_a_claim_of_mod_incompatibility() {
        let mut explanation = Explanation::default(); explanation.push("Minecraft exited with code 1"); explanation.push("java.lang.OutOfMemoryError"); assert!(explanation.message().is_none());
    }
    #[test] fn explanation_is_bounded_and_handles_unicode() {
        let mut explanation = Explanation::default(); explanation.push("ModLoadingException"); for _ in 0..1000 { explanation.push(&"Мод".repeat(2000)); } assert!(explanation.message().unwrap().len() <= 6168);
    }
}
