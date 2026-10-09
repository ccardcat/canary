//! Custom options may tune the managed JVM, never replace its entry point.
//! Kept independent of the backend so the policy can be tested without a GUI.

pub fn validate_jvm(arguments: &[String]) -> Result<(), &'static str> {
    let mut values = arguments.iter();
    while let Some(argument) = values.next() {
        let option = argument.split('=').next().unwrap_or("");
        if matches!(option, "-jar" | "-m" | "--module" | "--source" | "-cp" | "-classpath" | "--class-path") {
            return Err("The Minecraft entry point and classpath are managed by Canary, not custom JVM options");
        }
        if argument.starts_with('@') {
            return Err("Custom JVM argument files are not supported; enter the JVM options directly");
        }
        if !argument.starts_with('-') || matches!(argument.as_str(), "-" | "--") {
            return Err("Custom JVM options cannot contain a main class, JAR or source filename");
        }
        // These options legitimately take a separate operand. A bare operand
        // anywhere else would be interpreted by Java as the program to launch.
        if matches!(argument.as_str(), "--add-opens" | "--add-exports" | "--add-reads" | "--add-modules" | "--limit-modules" | "--enable-native-access" | "--patch-module" | "--module-path" | "-p" | "--upgrade-module-path") {
            let value = values.next().ok_or("A custom JVM option is missing its value")?;
            if value.is_empty() || value.starts_with(['-', '@']) {
                return Err("A custom JVM option has an invalid value");
            }
        }
    }
    Ok(())
}

pub fn requires_consent(arguments: &[String]) -> bool {
    arguments.iter().any(|argument| {
        ["-javaagent", "-agentlib", "-agentpath", "-Xrun", "-Xbootclasspath",
            "--patch-module", "--module-path", "--upgrade-module-path",
            "-Djava.system.class.loader", "-Djava.library.path", "-Djava.security.manager",
            "-Djava.ext.dirs", "-Djava.endorsed.dirs",
            "-XX:OnError", "-XX:OnOutOfMemoryError", "-XX:Flags", "-XX:VMOptionsFile", "@"]
            .iter().any(|prefix| argument.starts_with(prefix)) || argument == "-p"
    })
}

pub fn validate_game(arguments: &[String]) -> Result<(), &'static str> {
    for argument in arguments {
        let option = argument.split('=').next().unwrap_or("");
        if matches!(option, "--accessToken" | "--session" | "--uuid" | "--username" | "--userType" | "--xuid" | "--clientId" | "--userProperties") {
            return Err("Identity arguments are managed by the selected account");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(values: &[&str]) -> Vec<String> { values.iter().map(|value| (*value).into()).collect() }

    #[test]
    fn custom_options_cannot_select_another_program_or_classpath() {
        for values in [vec!["-jar", "mods/payload.jar"], vec!["PayloadMain"],
            vec!["--module=payload/main"], vec!["-m", "payload/main"],
            vec!["--source", "17", "Payload.java"], vec!["--class-path=mods/payload.jar"],
            vec!["-cp", "mods/payload.jar"], vec!["-classpath", "mods/payload.jar"],
            vec!["@options.txt"], vec!["@@PayloadMain"], vec!["--", "PayloadMain"]] {
            assert!(validate_jvm(&args(&values)).is_err(), "{values:?}");
        }
    }

    #[test]
    fn normal_tuning_and_separate_module_operands_are_retained() {
        for values in [vec![], vec!["-Xms512M", "-Xmx4G", "-XX:+UseG1GC"],
            vec!["--add-opens", "java.base/java.lang=ALL-UNNAMED", "-Dcanary.test=true"],
            vec!["--add-exports=java.base/sun.nio.ch=ALL-UNNAMED"],
            vec!["--add-modules", "jdk.incubator.vector"],
            vec!["--module-path", "C:/Path With Spaces/modules", "--add-modules", "example"],
            vec!["-Dcanary.literal=$(echo harmless); & | `echo harmless`"]] {
            assert!(validate_jvm(&args(&values)).is_ok(), "{values:?}");
        }
    }

    #[test]
    fn missing_or_expanded_operands_cannot_smuggle_an_entry_point() {
        for values in [vec!["--add-opens"], vec!["--add-opens", "@payload.txt"],
            vec!["--add-opens", "-jar"], vec!["--add-opens", ""],
            vec!["--add-opens", "java.base/java.lang=ALL-UNNAMED", "PayloadMain"]] {
            assert!(validate_jvm(&args(&values)).is_err(), "{values:?}");
        }
    }

    #[test]
    fn shell_hooks_config_files_and_native_code_need_explicit_consent() {
        for argument in ["-XX:OnError=echo harmless", "-XX:OnOutOfMemoryError=echo harmless",
            "-XX:Flags=options.txt", "-Xrunjdwp:transport=dt_socket", "-agentpath:/tmp/example",
            "--module-path=modules", "-p", "--upgrade-module-path=modules",
            "-Djava.security.manager=example.Manager", "-XX:VMOptionsFile=options.txt",
            "-Djava.ext.dirs=mods/extensions", "-Djava.endorsed.dirs=mods/endorsed"] {
            assert!(requires_consent(&args(&[argument])), "{argument}");
        }
        assert!(!requires_consent(&args(&["-Xmx4G", "-XX:+UseG1GC", "--add-opens=java.base/java.lang=ALL-UNNAMED"])));
    }

    #[test]
    fn managed_identity_cannot_be_overridden_and_game_values_stay_literal() {
        for values in [vec!["--accessToken=synthetic-token"], vec!["--username", "OtherPlayer"],
            vec!["--session=synthetic-session"]] {
            assert!(validate_game(&args(&values)).is_err(), "{values:?}");
        }
        assert!(validate_game(&args(&["--server", "play.example.org", "--port", "25565", "--fullscreen", "@literal-game-value"])).is_ok());
    }
}
