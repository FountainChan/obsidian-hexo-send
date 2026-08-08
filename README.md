# 🚀 Hexo Send

**English** | [简体中文](./README.zh-CN.md)

Keep writing in Obsidian and let Hexo Send handle the repetitive work of preparing posts for Hexo. 📝

Hexo Send is a desktop-only plugin that pre-releases selected Markdown files, folders, or multiple selections to a local Hexo repository. It organizes images, validates the generated site, and creates one local Git commit. It never pushes without an additional confirmation, never runs `hexo deploy`, and does not monitor GitHub Actions. 🛡️

## ✨ Features

- 📂 Pre-release one note, a folder, multiple file-tree selections, or the active note.
- 🏷️ Confirm the category and edit tags, keywords, descriptions, and image alt text before writing anything.
- 🖼️ Copy local images to `/images/<abbrlink>/` and populate cover and top-image metadata.
- 🔍 Detect Hexo, Node.js, Git, category mappings, and abbrlink configuration.
- 🤖 Optionally suggest metadata through a user-configured OpenAI-compatible endpoint. All core features work without AI.
- ✅ Run two Hexo validation passes, stage only the planned post and image paths, and create exactly one commit.
- 🚦 Show “Committed, not pushed” after success. Push occurs only after the user explicitly confirms it.

## 📋 Requirements

- Desktop Obsidian 1.11.4 or later.
- A trusted local Hexo Git repository with its dependencies already installed.
- A repository-local Hexo CLI at `node_modules/hexo/bin/hexo` and a configured `hexo-abbrlink` package.
- Node.js and Git available on the desktop system.

Hexo Send does not use `npx` to download or execute a missing Hexo installation. If the local CLI is absent, environment detection blocks the pre-release and asks you to install the repository dependencies yourself.

## 📥 Installation

### Community plugin directory

After the plugin is accepted, open **Settings → Community plugins → Browse**, search for **Hexo Send**, and install it. 🎉

### Beta or manual installation

- With [BRAT](https://github.com/TfTHacker/obsidian42-brat), add `FountainChan/obsidian-hexo-send` as a beta plugin.
- For manual installation, download `main.js`, `manifest.json`, and `styles.css` from the same [GitHub release](https://github.com/FountainChan/obsidian-hexo-send/releases), place them in `<vault>/.obsidian/plugins/hexo-send/`, reload Obsidian, and enable the plugin.

## 🧭 Usage

1. Set the local Hexo repository path in the plugin settings and run environment detection.
2. Right-click a Markdown file, folder, or selection and choose **Pre-release to Hexo…**.
3. Review the title, category, tags, keywords, description, image alt text, and conflict actions.
4. Select **Generate and commit**. A successful job stops at **Committed, not pushed**.
5. Select **Push** only when you want to send that commit to the configured Git remote.

## 🔐 Security, privacy, and privileged capabilities

Hexo Send is desktop-only because its core workflow intentionally connects Obsidian to a local Hexo toolchain. The Community directory may display filesystem and process-execution warnings for these capabilities.

### Direct filesystem access

- The plugin uses Node.js filesystem APIs to read and write the local Hexo repository explicitly selected by the user.
- It reads source notes through the Obsidian Vault API and may read selected Vault attachments so they can be copied into the Hexo repository. Source notes are never modified.
- Crash-recovery journals and file backups are stored under the operating system's temporary directory.
- Repository-relative paths are normalized and checked against traversal, directory links, and final-target symbolic links before reads, writes, copies, or recovery operations.
- Git staging is verified against an exact allowlist. The plugin never runs `git add .`.

### Process execution

- The plugin starts Git and the user-configured Node.js executable. Node.js runs only the Hexo CLI installed inside the selected repository.
- When an image-download proxy is configured, the plugin may start `curl.exe`; every redirect target is revalidated to reject localhost and private-network destinations.
- Processes are started with `shell: false` and separate argument arrays. User content is never concatenated into a shell command.
- Hexo plugins, Hexo themes, Git hooks, and configured executable paths are executable code. Use only repositories, dependencies, hooks, and executable paths that you trust.
- The plugin runs `hexo clean`, `hexo generate --bail`, and narrowly scoped Git inspection, staging, commit, and push commands. `git push` is available only after explicit confirmation.

### Clipboard

The plugin does not call the system Clipboard API. Diagnostic details are displayed in a read-only text area; copying is performed manually by the user with the normal operating-system shortcut.

### Network and AI

- Remote images are downloaded only when referenced by a selected article. Localhost, private-network addresses, unsafe redirects, non-image responses, and files larger than 20 MB are rejected.
- Git connects to the configured remote only after the user selects **Push**.
- When optional AI assistance is enabled, the full article body together with candidate categories and tags is sent to the user-configured OpenAI-compatible endpoint. The API key is stored only in Obsidian SecretStorage.
- The plugin contains no client-side telemetry, ads, or self-update mechanism.

## 🧰 Development

```powershell
npm install
npm run verify
```

Useful commands:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify`
- `npm run package`

## 🎁 Releases

Push a tag that exactly matches the versions in `package.json` and `manifest.json`, without a `v` prefix. GitHub Actions runs the full quality gate, generates build provenance, and publishes only the three assets supported by Obsidian:

- `main.js`
- `manifest.json`
- `styles.css`

## 📄 License

Hexo Send is released under the [MIT License](./LICENSE).

The technical design is documented in [`docs/plans/2026-08-08-technical-development-plan.md`](./docs/plans/2026-08-08-technical-development-plan.md).
