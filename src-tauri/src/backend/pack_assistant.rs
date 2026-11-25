use super::model::{BackendError, Instance, Result};
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

const OLLAMA: &str = "http://127.0.0.1:11434/api/generate";
const MAX_RESPONSE: usize = 64 * 1024;

#[derive(Deserialize)]
struct GeneratedResponse {
    response: String,
}

#[derive(Deserialize)]
struct Plan {
    mods: Vec<String>,
}

pub fn parse_mods(input: &str) -> Result<Vec<String>> {
    let plan: Plan = serde_json::from_str(input)
        .map_err(|_| BackendError::new("pack_ai_response", "The model returned an invalid mod list"))?;
    let mut mods = Vec::new();
    for raw in plan.mods {
        let slug = raw.trim().to_ascii_lowercase();
        if (2..=64).contains(&slug.len())
            && slug.bytes().next().is_some_and(|byte| byte.is_ascii_alphanumeric())
            && slug.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"-_".contains(&byte))
            && !mods.contains(&slug)
        {
            mods.push(slug);
            if mods.len() == 8 {
                break;
            }
        }
    }
    Ok(mods)
}

pub const INSTRUCTIONS: &str = "Recommend up to eight real Modrinth mods for the given Minecraft version and mod loader. Return only their exact URL slugs in the mods array. Use no tools, URLs or prose. Omit uncertain projects. Return an empty list if there are no suitable mods.";

pub fn schema() -> serde_json::Value {
    json!({"type":"object","properties":{"mods":{"type":"array","items":{"type":"string"},"maxItems":8}},"required":["mods"],"additionalProperties":false})
}

pub fn validated_prompt(instance: &Instance, prompt: &str) -> Result<String> {
    let prompt = prompt.trim();
    if prompt.is_empty() || prompt.chars().count() > 600 || instance.loader == "vanilla" {
        return Err(BackendError::new("pack_ai_input", "Select an instance with a mod loader and enter a brief prompt"));
    }
    Ok(format!("Minecraft {} / {}\nRequested play style: {}", instance.minecraft, instance.loader, prompt))
}

pub async fn suggest(instance: &Instance, prompt: &str, model: &str) -> Result<Vec<String>> {
    let prompt = validated_prompt(instance, prompt)?;
    let model = model.trim();
    if model.is_empty() || model.len() > 100
        || !model.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"-_:./".contains(&byte))
    {
        return Err(BackendError::new("pack_ai_input", "Enter a valid Ollama model name"));
    }
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(75))
        .build()
        .map_err(|_| BackendError::new("pack_ai_unreachable", "Could not initialize Ollama connection"))?;
    let mut response = client.post(OLLAMA).json(&json!({
        "model": model,
        "system": INSTRUCTIONS,
        "prompt": prompt,
        "stream": false,
        "options": {"num_predict": 384},
        "format": schema()
    })).send().await.map_err(|error| {
        if error.is_timeout() {
            BackendError::new("pack_ai_timeout", "Ollama did not respond in time")
        } else {
            BackendError::new("pack_ai_unreachable", "Could not reach Ollama on this computer")
        }
    })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(BackendError::new("pack_ai_model", "The requested Ollama model was not found"));
    }
    if !response.status().is_success() {
        return Err(BackendError::new("pack_ai_response", "Ollama could not generate a mod list"));
    }

    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| BackendError::new("pack_ai_response", "Could not read Ollama response"))? {
        if chunk.len() > MAX_RESPONSE - body.len() {
            return Err(BackendError::new("pack_ai_response", "Ollama response exceeded the size limit"));
        }
        body.extend_from_slice(&chunk);
    }
    let generated: GeneratedResponse = serde_json::from_slice(&body)
        .map_err(|_| BackendError::new("pack_ai_response", "Ollama returned an invalid response"))?;
    parse_mods(&generated.response)
}

#[cfg(test)]
mod tests {
    use super::parse_mods;

    #[test]
    fn accepts_only_bounded_modrinth_slugs() {
        let input = r#"{"mods":[" Sodium ","sodium","https://example.org/file","../mod","-bad","lithium","iris","zoomify","modmenu","ferrite-core","entityculling","modernfix","immediatelyfast"]}"#;
        assert_eq!(parse_mods(input).unwrap(), ["sodium", "lithium", "iris", "zoomify", "modmenu", "ferrite-core", "entityculling", "modernfix"]);
        assert!(parse_mods(r#"{"mods":"sodium"}"#).is_err());
    }
}
