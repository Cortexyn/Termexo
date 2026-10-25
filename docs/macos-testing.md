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
- **Windows at run time.** The macOS work was done on a Mac. A Windows CI run (below) covers the
  build and the unit tests, but nobody has started the Windows app or a terminal with each agent
  since the merge.

## Windows: build and unit tests (CI run on a fork, 25 October 2026)

The build and the tests were run on a GitHub `windows-latest` runner (MSVC, Node 24), once for the
state before the macOS merge (`1585c63`) and once for `main` after it (`51e382e`).

| | Before the merge | After the merge |
|---|---|---|
| `npm ci` and the production frontend build | passed | passed |
| `cargo test --lib` | 432 passed, **2 failed** | 437 passed, **1 failed** |
| Frontend tests (three tries) | `clipboard-text` and `external-link` failed in every try | the same two files failed in every try |

- The failing Rust tests are not caused by the merge.
  `git::tests::discovers_a_repository_created_below_the_terminal_directory` fails in both states
  (it compares a temp path in two spellings on the runner), and
  `commands::agent::tests::restores_opencode_proxy_and_terminal_plugin` failed only before the
  merge because it needs an `opencode` CLI on the machine; it is skipped without one now.
- The frontend failures are the same in both states: the tests replace
  `window.__TAURI_INTERNALS__` and fail with `window.__TAURI_INTERNALS__.invoke is not a function`.
- The Windows-only tests (PowerShell syntax, extended paths, ConPTY checks) passed in both states.

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
