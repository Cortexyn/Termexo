# Code signing policy

Status: the SignPath Foundation application was submitted on 27 October 2026
and is awaiting review. Project approval has not been granted and no SignPath
release certificate is configured yet.

## Scope

The intended signing scope is Termexo's Windows application, EXE installer,
and MSI installer, built from this public repository. Upstream components keep
their original signatures or remain unsigned; they are not signed as Termexo-owned code.
macOS signing is separate from this policy.

## Release process

The [Windows workflow](../.github/workflows/windows-build.yml) runs on GitHub-hosted
Windows runners. Its optional SignPath path signs the application before packaging,
then requests signatures for the installers. Each request waits for manual approval.
Signing requires the approved service configuration and repository secret.

Before uploading signed output, the workflow requires trusted signatures from
the configured certificate, timestamps, matching versions, and x64 architecture.
Checksums and source commit metadata are generated after signing.
An unsigned build is never relabeled as a signed release.

## Responsibilities

Repository owner [gemron](https://github.com/gemron) is the designated maintainer,
reviewer of external contributions, and signing approver. Signing participants
must use multi-factor authentication for GitHub and SignPath.

## Privacy and attribution

See [Privacy and network connections](privacy.md). Application contact information
is not published in this repository.

If the application is approved, the program's attribution will be:

> Free code signing provided by [SignPath.io](https://signpath.io/), certificate by
> [SignPath Foundation](https://signpath.org/).

This is a planned attribution, not a claim that sponsorship has been granted.
The program's current requirements are published in its [official conditions](https://signpath.org/terms).
