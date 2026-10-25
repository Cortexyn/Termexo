# Termexo on macOS: what was tested

Status of the macOS port that arrived through #39. It lists what was checked by hand, what was not,
and the limits that are known. `docs/macos-port.md` is the original working plan (in German) and
is not kept up to date.

Environment of the hand tests (24 October 2026): Apple Silicon, macOS 27, Xcode 27.1, app signed
with an "Apple Development" certificate, **macOS firewall off**.

## Tested by hand

| Flow | Result |
|---|---|
| Create a model profile with an API key, restart, delete it | The key lives only in the Keychain (service `dev.agentdock.desktop`). It is not in the database, logs or caches, the UI never shows it, and deleting the profile removes the Keychain entry. |
| Claude Code in a Termexo terminal with the existing login, allowance from the status line | Runs; the 5-hour and weekly values appear after the first answer. |
| Codex in a Termexo terminal with the existing login, hooks, allowance | Runs; the terminal status changes through the hooks. |
| Second Claude account: `claude auth login`, own Keychain entry, delete the account | The login runs in zsh, its credentials stay apart from the system account, and the directory and the Keychain entry are removed on delete. |
| Remote access: switch on, connect from a phone, use a terminal, switch off | TLS with a self-signed certificate (the browser warns, the fingerprint matches the one on disk). The token is in the Keychain. A wrong token is rejected, five failures lock the source address, a foreign `Origin` gets 403, the legacy plain handshake is refused. The port is closed after switching it off. |
| Finding agents when the app is started from the Finder | Agents in `~/.local/bin` are found through the login shell `PATH`. |

## Not tested

- Remote access through a relay, several phones at once, switching networks.
- An active macOS firewall (the "accept incoming connections" prompt).
- Signatures other than "Apple Development" (Developer ID, ad hoc) and notarization. Keychain
  access is tied to the app signature and may behave differently.
- Codex login with a second account; Antigravity, OpenCode, Pi and Grok on macOS.
- Real provider API keys (a test key was used).
- Intel Macs: the code compiles for `x86_64-apple-darwin`, nothing more.
- **Windows.** The macOS work was done on a Mac and could not be built for Windows. All platform
  code sits behind `cfg` switches and the Windows paths are meant to behave as before, but nobody
  has run the Windows build, its tests or a terminal with each agent since the merge.

## Known limits

- No update check on macOS: the release assets are Windows installers, so it always reports
  "up to date".
- No Windows system-proxy equivalent on macOS.
- The login shell `PATH` is read once at start with a 5 second limit; a very slow shell profile
  can delay the start by that long.
- `-l` is passed only to zsh, bash, sh, dash, ksh and fish.
- Messages returned from the Rust side are not localized; new ones are English.
- The frontend test suite is flaky on its own: on the unmodified `main` before the merge, two of
  four runs had three or four failing specs (`clipboard-text`, `external-link` and similar), the
  other two passed. Run it again before blaming a change.

## Bugs the hand tests found (already fixed in `main`)

- A Codex launch line of about 4 KB was mangled when typed into a fresh shell, because the
  terminal driver discards input past about 1000 characters. Long commands now go through an
  owner-only script.
- Deleting a managed Claude account left its sign-in in the Keychain although the dialog says the
  credential is removed.
- The remote access TLS private key was written world-readable; it is now `0600` on Unix.
- The account login terminal never ended on Unix, so its tab stayed "running".
