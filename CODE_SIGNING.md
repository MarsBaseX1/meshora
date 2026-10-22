# Code signing policy

## Current status

**Application status (2026-10-22):** The SignPath Foundation application form has been submitted and is awaiting review. Acceptance has not been confirmed, and SignPath signing is not yet confirmed as active. Submitting the application does not mean the project has been accepted or that any download is signed. **Until a release explicitly identifies a signed installer and the installer has a valid Authenticode signature, treat the Windows downloads as unsigned.**

The GitHub Actions integration is designed to submit the Windows NSIS installer built by the repository's GitHub-hosted release workflow. Once SignPath is configured, the workflow waits for the signing request to be completed and verifies the returned installer's Authenticode signature before publishing the release. Every release signing request remains subject to manual approval.

## Attribution

When SignPath Foundation has accepted the project and signing is active, the attribution for the signed Windows installer will be:

> Free code signing provided by SignPath.io, certificate by SignPath Foundation.

This statement describes the intended service attribution and does not mean that signing is already active.

- SignPath Foundation: https://signpath.org/
- SignPath.io: https://signpath.io/
- Signing workflow: https://github.com/MarsBaseX1/meshora/actions/workflows/build-windows.yml

## Signing scope

- **Windows installer (Meshora-Setup-*.exe):** submitted for signing when the SignPath configuration is present and the release request is approved.
- **Portable ZIP (Meshora-*-win32-x64.zip):** not signed by this initial integration. Treat it as unsigned unless a release explicitly says otherwise.
- Third-party binaries bundled with the application are not signed using a Meshora project certificate.

If SignPath configuration is missing, the release workflow can publish an unsigned installer and clearly labels it as unsigned in the release notes. If a configured signing request fails or the returned signature is invalid, the workflow stops instead of silently publishing an unsigned installer as signed.

## Maintainer roles

- **Authors and committers:** `MarsBaseX1` (repository owner) and any additional maintainers with write access to [MarsBaseX1/meshora](https://github.com/MarsBaseX1/meshora).
- **Reviewers:** `MarsBaseX1` and designated maintainers who review pull requests before changes are merged. Release-workflow and signing-configuration changes receive particular scrutiny.
- **Signing approver:** `MarsBaseX1` is the intended release approver and must be granted the corresponding approver role in SignPath before signing is activated. Each release signing request must be manually reviewed and approved before the signed installer is published.

The role names above describe the intended project structure; the SignPath account, approver permission, and any additional reviewer assignments must be configured during onboarding. Role assignments in GitHub and SignPath must be kept in sync. Maintainers must use multi-factor authentication for GitHub and SignPath access.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

Meshora is a local desktop model-conversion tool. The signing workflow sends the Windows installer built by GitHub Actions to SignPath only to request code signing. Local model files and user conversion data are not submitted by this release workflow.

## Release verification

After downloading a release:

1. Open the release notes and follow the Code signing policy link.
2. On Windows, right-click the installer, select **Properties → Digital Signatures**, and inspect the signer and signature status.
3. Alternatively, run PowerShell:

~~~powershell
Get-AuthenticodeSignature .\Meshora-Setup-<version>.exe | Format-List Status, StatusMessage, SignerCertificate
~~~

A signed release must show a valid signature. If no valid signature is present, treat the installer as unsigned and report the release issue at https://github.com/MarsBaseX1/meshora/issues.
