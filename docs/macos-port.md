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

## Stand und bekannte Grenzen

- **Claude-Quota:** Sie kommt aus der Statusline von Claude Code (`rate_limits`), nicht aus dem
  Schlüsselbund. Das gilt nur für Pro- und Max-Abos, die Werte erscheinen nach der ersten Antwort in
  einem Termexo-Terminal, und eine eigene `statusLine` in `~/.claude/settings.json` hat Vorrang
  (dann zeigt die Quota-Ansicht einen entsprechenden Hinweis).
- **Agent-Installation:** Claude, Codex und Antigravity nutzen unter macOS die `install.sh` des
  Herstellers (`curl -fsSL … | bash`); die übrigen Agents laufen über npm.
- **Login-Shell:** `-l` wird nur an zsh, bash, sh, dash, ksh und fish übergeben. Der Start-PATH wird
  einmalig über `$SHELL -ilc` bestimmt (Zeitlimit 5 s).
- **Texte:** Alle Meldungen sind englisch; das Frontend ordnet die Quota-Beschriftungen über die
  i18n-Tabellen zu.
- **Nicht portiert:** Update-Prüfung (auf macOS meldet sie immer „aktuell“, weil die Original-Releases Windows-Installer sind), Windows-Systemproxy,
  Notarisierung.
- **Sprachen:** Die deutsche Übersetzung ist vollständig (alle Schlüssel der englischen Tabelle).
  Dafür liegt die Fehlergrenze für das Start-Bundle in `angular.json` bei 1640 kB statt 1622 kB.
  Es gibt eine Prüfung, dass `en` und `de` dieselben Schlüssel haben, nur über die Schlüssellisten,
  nicht als Test im Repository.
- **Content Security Policy:** Die macOS-Konfiguration (`tauri.macos.conf.json`) setzt eine CSP
  (`script-src 'self'`, keine externen Quellen, `connect-src` nur für die Tauri-Schnittstelle).
  Dafür baut macOS Angular mit der Konfiguration `macos` (`inlineCritical` aus), weil der sonst
  erzeugte Inline-Handler `onload="this.media='all'"` von `script-src` blockiert würde. Unter
  Windows bleibt `csp: null`. Geprüft wurde die ausgelieferte Oberfläche in WKWebView ohne
  Verstöße und danach von Hand in der echten App (Terminals, Einstellungen, Fernzugriff).

## Getestet (Handtest, 24.10.2026)

Umgebung: Apple Silicon, macOS 27, Xcode 27.1, Development-Signatur, **Firewall aus**.

| Ablauf | Ergebnis |
|---|---|
| Modellprofil mit API-Key anlegen, Neustart, löschen | Key liegt nur im Schlüsselbund (`dev.agentdock.desktop`), nicht in Datenbank, Logs oder Caches; die Oberfläche zeigt ihn nie; nach dem Löschen ist der Eintrag weg |
| Claude Code im Termexo-Terminal (bestehender Login), Quota über die Statusline | läuft, 5-Stunden- und Wochenwerte erscheinen |
| Codex im Termexo-Terminal (bestehender Login), Hooks, Quota | läuft, Status wechselt per Hook auf „abgeschlossen“ |
| Zweites Claude-Konto: `claude auth login`, eigener Schlüsselbund-Eintrag, Konto löschen | Login läuft in zsh, Zugangsdaten bleiben vom System-Konto getrennt, Verzeichnis und Eintrag verschwinden beim Löschen |
| Fernzugriff einschalten, vom Handy verbinden, Terminal bedienen, ausschalten | TLS (selbstsigniert, Warnung im Browser), Token im Schlüsselbund; falsches Token wird abgelehnt, nach 5 Fehlversuchen gesperrt, fremder Origin 403, Downgrade abgelehnt; nach dem Ausschalten ist der Port zu |
| Agenten per Finder gestartet finden (`~/.local/bin`) | gefunden über den Login-Shell-PATH |

Bei den Handtests gefunden und behoben: zu lange Codex-Startzeile (die Shell verwarf Eingaben über
etwa 1000 Zeichen; lange Befehle laufen jetzt über ein Skript), Token eines gelöschten Kontos blieb
im Schlüsselbund, TLS-Schlüssel mit zu offenen Rechten, Login-Terminal endete nie.

## Nicht getestet

- Fernzugriff über einen Relay, mehrere Handys gleichzeitig, WLAN-Wechsel.
- Aktive macOS-Firewall (die Abfrage nach eingehenden Verbindungen).
- Andere Signaturen als „Apple Development“ (Developer ID, ad-hoc) und die Notarisierung; der
  Schlüsselbund-Zugriff ist an die App-Signatur gebunden und könnte sich anders verhalten.
- Agent-Login für Codex mit einem zweiten Konto, Antigravity, OpenCode, Pi, Grok.
- Echte API-Keys eines Anbieters (getestet wurde mit einem Test-Key).
- Intel-Macs (nur kompiliert, `x86_64-apple-darwin`).
- Windows: Der Code wurde nur auf macOS gebaut. Alle Änderungen liegen hinter `cfg`-Schaltern, ein
  Windows-Build war hier nicht möglich.

## Bekannte Eigenheiten

- Die Frontend-Tests sind teilweise instabil (Tests, die `__TAURI_INTERNALS__` ersetzen, zum
  Beispiel `clipboard-text`, `external-link`). Das gilt auch für das unveränderte Original: In vier
  Läufen fielen zweimal drei bis vier Tests aus, zweimal liefen alle durch.
- Fehlermeldungen aus dem Rust-Teil sind nicht lokalisiert.

## Bauen und Signieren

```sh
. ~/.cargo/env
cd apps/desktop-ui
# nur .app, oder --bundles dmg für das DMG (baut die .app mit)
APPLE_SIGNING_IDENTITY="Apple Development: …" node scripts/run-tauri.mjs build --bundles dmg
```

- Ohne `APPLE_SIGNING_IDENTITY` entsteht eine ad-hoc-signierte App. Die Identität gehört nicht in
  die Konfiguration, sondern wird beim Aufruf übergeben.
- Ein „Apple Development“-Zertifikat reicht für den eigenen Mac. Für die Weitergabe braucht es ein
  „Developer ID Application“-Zertifikat und die Notarisierung (`APPLE_ID`, `APPLE_PASSWORD`,
  `APPLE_TEAM_ID` oder `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_PATH`); Tauri reicht die
  App dann selbst ein.
- Fehlt dem Zertifikat die Vertrauenskette, muss das passende WWDR-Zwischenzertifikat von
  https://www.apple.com/certificateauthority/ in den Anmelde-Schlüsselbund (nicht „iCloud“).
- Der Schlüsselbund muss entsperrt sein, sonst endet `codesign` mit `errSecInternalComponent`.
- Vor dem Commit: `cargo fmt` in `src-tauri`; `cargo clippy` zeigt auf macOS einige Warnungen zu
  Windows-Code, der hier nicht benutzt wird (Systemproxy, `command_on_path`).
