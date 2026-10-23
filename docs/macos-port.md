# macOS-Port (Apple Silicon)

Branch: `macos-port`. Regel: Windows-Verhalten bleibt unverändert; macOS/Unix kommt über zusätzliche
`cfg(unix)` / `cfg(target_os = "macos")`-Zweige dazu.

## Ausgangslage

`cargo check` läuft auf macOS bereits durch, denn die meisten `cfg(windows)`-Stellen haben einen
`cfg(not(windows))`-Fallback. Gebrochen ist vor allem das **Laufzeitverhalten**:

| # | Problem | Ort | Plan |
|---|---------|-----|------|
| 1 | Launch-Kommandos sind PowerShell-Syntax (`& 'pfad' --flag 'wert'`, `''`-Escaping). In zsh startet `&` den Job im Hintergrund. | `agent/cli.rs` (`powershell_quote`), `agent/{claude,codex,opencode,pi,grok,antigravity}.rs`, `account.rs`, `cli.rs` | Plattformabhängige `shell_quote` / `shell_invoke`; Windows-Ausgabe bleibt byte-identisch. |
| 2 | Standard-Shell ist `powershell.exe` (Frontend `DEFAULT_SHELL`, persistierte Workspaces). | `pty/mod.rs`, `app-state.service.ts` | Backend löst auf Unix `powershell*`/`cmd*` zur Login-Shell des Users auf (`$SHELL`, Fallback `/bin/zsh`), Start mit `-l`. |
| 3 | Agent-Erkennung nutzt nur `PATH`; GUI-Apps erben unter macOS nicht den Shell-PATH. | `agent/*.rs`, `agent/cli.rs` | Login-Shell-PATH einmal ermitteln (`$SHELL -ilc 'echo $PATH'`), in den Prozess-PATH mergen; zusätzlich feste Orte (`~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, npm global). |
| 4 | `keyring` nur mit `windows-native`. | `Cargo.toml` | Zielabhängige Features: `apple-native` für macOS. |
| 5 | `conpty.dll` / `OpenConsole.exe` im Bundle. | `tauri.conf.json` | Resources in `tauri.windows.conf.json` verschieben; `tauri.macos.conf.json` für Fenster. |
| 6 | `decorations: false` → keine Ampelknöpfe; eigene Windows-Controls in der Topbar. | `tauri.conf.json`, `app.html`, `app.ts` | macOS: `titleBarStyle: "Overlay"`, `hiddenTitle`; Windows-Controls ausblenden, Platz links für die Ampel. |
| 7 | Datenverzeichnis folgt der Bundle-ID (`dev.agentdock.desktop`). | `lib.rs` | Auf macOS `~/Library/Application Support/Termexo`. |
| 8 | Toast nur über Windows-AUMID. | `notification.rs`, `commands/notification.rs` | `tauri-plugin-notification` für macOS (Plugin ist bereits abhängig eingebunden). |
| 9 | Update-/Installationsbefehle über `powershell`/`irm`. | `cli.rs`, `commands/update.rs`, `agent.service.ts` | Unix-Variante (`sh`), Auto-Update auf macOS nur Link/Manuell. |
| 10 | `.exe`/`.cmd`-Suche, `APPDATA`, `USERPROFILE`. | `agent/*.rs`, `mcp/agents.rs`, `quota.rs` | `home_dir`-basierte Kandidaten für Unix. |
| 11 | `open`-Befehle (Explorer, Standard-App). | `commands/open.rs` | `open` / `open -R` auf macOS. |
| 12 | Systemproxy aus Windows-Registry. | `system_proxy.rs` | macOS: Umgebungsvariablen; `scutil --proxy` optional. |
| 13 | Fonts per DirectWrite. | `fonts.rs` | Fallback-Liste, später CoreText. |
| 14 | Build-Skripte nur `.cmd` (MSVC). | `package.json`, `scripts/` | `tauri:dev`/`tauri:build` für macOS ergänzen. |

## Reihenfolge

1. Toolchain & Branch (erledigt: Rust 1.99.1, Node 26, Branch `macos-port`)
2. Build-Konfiguration (keyring, Bundle, Fenster, npm-Skripte)
3. Shell-Auflösung + Login-Shell-PATH
4. Launch-Syntax (`shell_quote`) und Agent-Erkennung
5. Rest: Pfade, open, Proxy, Fonts, Updates
6. Fenster-UI (Ampelknöpfe, Drag-Region)
7. Benachrichtigungen
8. `cargo test`, `tauri dev`, `tauri build` → `.app`/`.dmg`
