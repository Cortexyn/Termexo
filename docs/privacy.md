# Privacy and network connections

This describes Termexo's desktop application and the project's website as of
27 October 2026. Third-party agents and services have their own data practices.

## Local application data

Termexo stores workspace configuration, tasks, terminal state, and related
application records locally. Installed agent CLIs also maintain their own
configuration, authentication, session, and log files. Exporting or sharing these
records can disclose project or account information; review the chosen files first.

## Network connections

- **Updates:** automatic update checks are enabled by default and query the public
  GitHub release endpoint. They can be disabled in settings; manual checks remain available.
- **Model catalog:** the application fetches public model metadata from
  `https://models.dev/api.json` at initialization and refreshes expired cached data.
  The catalog request does not include project files, prompts, API keys, or account credentials.
- **Agents, models, authentication, and quota:** installed agents and configured
  providers may contact their respective services. Requests can use account or API
  credentials and carry prompts or project content according to the user's actions,
  CLI behavior, and provider configuration. Consult those providers' privacy policies.
- **Preview and links:** opening a website or other external resource contacts its
  destination. That website's own policies apply.
- **Remote access:** disabled by default. When enabled, connected clients can receive
  workspace and terminal data according to the remote feature's permissions. A
  configured relay also receives connection information. Operators choose the relay
  and who receives access.
- **Third-party notifications:** enabled notification channels send their configured
  messages to the selected destination. These can contain project/task/session names,
  agent and model names, branch information, event type, and time. The global switch
  and channel settings control these notifications.
- **Installations and updates of tools:** requesting CLI installation or updates can
  contact package registries and vendor download services.

Network services can receive normal request information, such as the connecting IP
address and HTTP headers. Public metadata requests are separate from uploading
workspace content; the catalog and updater do not receive project-file payloads.

## Website

The production website uses the Busuanzi third-party page-view counter. Its requests
can expose the visitor's IP address and website origin to that service. This website
counter is not included in the desktop application or remote workbench. See the
[website maintenance notes](../website/README.md) for its implementation and limitations.

## Signing and support

Code-signing services receive the release artifacts and build-origin information
needed to sign a release. Project source and release artifacts are public. Signing
credentials remain in the chosen service and GitHub's secret storage.
The SignPath application is still being prepared; no approval or signing is claimed.

Information voluntarily included in a GitHub issue or support request is sent to
that destination and may become public. Use [GitHub issues](https://github.com/gemron/Termexo/issues)
for general questions without attaching credentials or private session data.
