# Package verification and release / 配布の確認と公開

The repository can be built and tested without signing into npm. Publishing to npm still requires an authorized npm account. Do not advertise a registry install command until the package is publicly available and verified.

## Verify the actual package

```bash
npm ci
npm test
npm run test:package
```

The package check starts from a temporary source copy without `dist`, runs `npm pack`, checks required files, installs the resulting tarball into a separate consumer directory, and runs both the existing mock smoke test and the packaged demo. It removes its temporary directories afterward. It downloads runtime dependencies as needed, but never publishes anything.

`prepack` builds the JavaScript for both `npm pack` and `npm publish`. English/Japanese READMEs, demo guides, the example client, and the contribution guide are included. `npm fund` can discover the maintainer's GitHub Sponsors link from package metadata.

CI checks Node.js 22 and 24 on Linux. These checks use simulated vehicle data, skip dependency install scripts, and do not validate serial adapters, Bluetooth pairing, or real vehicles.

## GitHub release / GitHubでのリリース

A GitHub release distributes the npm tarball and the Claude Desktop extension while npm registry publication is pending. The `Release packages` workflow (`.github/workflows/release-packages.yml`) builds both on every pull request and push to `main`:

- **npm tarball:** runs `npm run test:package`, packs `obd2-mcp-<version>.tgz`, and runs the README demo command against that exact file from an empty directory.
- **Claude Desktop extension:** stages `obd2-mcp-<version>.mcpb` with `npm run build:mcpb`, validates and packs it with the pinned `@anthropic-ai/mcpb` CLI, checks that it still contains serialport binaries for Windows, macOS and Linux, and starts it the way Claude Desktop does with default, cleared and changed settings (`scripts/check-mcpb.mjs`). Its tool and prompt lists must match the server; its version comes from `package.json` and its manifest from `mcpb/manifest.json`.

Both files are available as workflow artifacts for manual testing.

To release:

1. Merge a reviewed commit to `main` whose `package.json` version, `CHANGELOG.md` entry and README release URLs all name the new version, and whose CI and `Release packages` checks passed.
2. Create a GitHub release with a new tag `v<version>` on that commit and publish it.
3. The workflow attaches `obd2-mcp-<version>.tgz`, `obd2-mcp-<version>.mcpb` and `SHA256SUMS`. It refuses to attach anything if the file versions do not match the tag.
4. After the packages are attached, the workflow lists the release's `.mcpb` in the [official MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.shoka-jp/obd2-mcp`. It fills in `server.json` with the version, download URL and SHA-256, and signs in with GitHub OIDC, so no secret is needed. To list an already published release, run the `Release packages` workflow manually with `registry_tag` set (for example `v0.6.0`). The repository's `server.json` describes the latest release.
5. Download the published assets, compare them with `SHA256SUMS`, and run the README demo command from a fresh directory in English and Japanese. Install the `.mcpb` in Claude Desktop on at least one desktop platform and confirm the mock vehicle, `list_serial_ports` and a guided prompt respond.

To build locally instead: `npm ci`, `npm pack`, `npm run build:mcpb`, then `npx @anthropic-ai/mcpb pack build/mcpb obd2-mcp-<version>.mcpb`.

GitHubリリースでは、npmパッケージ（`.tgz`）とClaude Desktop拡張機能（`.mcpb`）を配布します。`Release packages` ワークフローがPRと `main` へのpushごとに両方を作成し、利用者と同じ方法で起動を確認します。バージョン・CHANGELOG・READMEのURLを更新したコミットを `main` にマージし、そのコミットに `v<バージョン>` のタグを付けたリリースを公開すると、`.tgz`・`.mcpb`・`SHA256SUMS` が自動で添付されます。ファイルのバージョンがタグと一致しない場合は添付しません。添付後は、`.mcpb` を[公式MCPレジストリ](https://registry.modelcontextprotocol.io)に `io.github.shoka-jp/obd2-mcp` として自動で登録します（GitHub OIDCを使うため秘密情報は不要）。公開済みのリリースを登録するときは、`Release packages` ワークフローを `registry_tag`（例：`v0.6.0`）を指定して手動実行します。公開後は再ダウンロードしてハッシュを照合し、READMEの英日コマンドを確認したうえで、少なくとも1つのOSのClaude Desktopに `.mcpb` を入れて、模擬車両・`list_serial_ports`・ガイド付きプロンプトが応答することを確認してください。

## npm registry publishing

The package is not on the npm registry yet; installs use the GitHub release tarball. Publishing needs the maintainer's own npm account, so these steps are for the maintainer only. Never commit an npm token or paste one into an issue or a pull request.

### First version: publish by hand (once)

npm trusted publishing can only be set up for a package that already exists, so the first version is published from the maintainer's computer.

1. Sign in to npmjs.com with two-factor authentication turned on. Check that `obd2-mcp` is still free (`npm view obd2-mcp` answers 404) and that the account will own it.
2. Check out the released tag (for example `git checkout v0.9.0`), then run `npm ci`, `npm test` and `npm run test:package`, and inspect `npm pack --dry-run`.
3. Run `npm login`, then `npm publish --access public`. npm asks for the second factor in the browser or terminal.
4. Check `npm view obd2-mcp version`, then install that exact version into an empty directory and run it against the mock vehicle (`npx -y obd2-mcp@<version> --demo --summary`).

### Later versions: automatic, without a token

After the first version, `.github/workflows/npm-publish.yml` publishes each GitHub release to npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers): GitHub proves to npm which workflow is running, so no npm token is stored, and npm adds a provenance statement to the package. It does nothing until it is switched on:

1. On npmjs.com, open the `obd2-mcp` package → **Settings** → **Trusted Publisher** → **GitHub Actions**, and enter: user `shoka-jp`, repository `obd2-mcp`, workflow `npm-publish.yml`, environment `npm`.
2. In the GitHub repository, open **Settings** → **Secrets and variables** → **Actions** → **Variables** and add `NPM_PUBLISH` with the value `true`. Optionally, under **Settings** → **Environments** → `npm`, add yourself as a required reviewer so each publish waits for your approval.
3. Optionally, on npmjs.com under **Settings** → **Publishing access**, require two-factor authentication and disallow tokens, so only the workflow (and you with your second factor) can publish.

The workflow runs when a release is published (and can be run by hand with a tag). It checks that `package.json` matches the tag, runs the tests, skips a version that is already on npm, publishes, and confirms that the version is visible. A run with `NPM_PUBLISH` unset is skipped.

### After npm publishing works

- Change the install commands in both READMEs, `docs/try-mock.md` and `docs/demo-results.md` from the release tarball URL to `obd2-mcp@<version>` (or `obd2-mcp`), and check them from a fresh directory.
- `package.json` already has `mcpName` (`io.github.shoka-jp/obd2-mcp`), which the MCP Registry uses to check that an npm package belongs to this server. An `npm` entry can then be added to `server.json` next to the `.mcpb`, with the `Release packages` workflow updating its version.
- Submit the npm package to MCP directories that list npm packages.

Sources: [npm trusted publishers](https://docs.npmjs.com/trusted-publishers), [npm publish](https://docs.npmjs.com/cli/commands/npm-publish/), [npm lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/).

## 日本語

`npm ci` → `npm test` → `npm run test:package` で、npmログインなしで配布物を検証できます。最後のコマンドは、ビルド成果物のない一時ディレクトリからパッケージを作成し、別ディレクトリへインストールしてモックテストとデモを実行します。公開はしません。

`npm pack` と `npm publish` の前に自動ビルドし、英日README・デモ資料・サンプル・貢献ガイドを同梱します。npmの支援情報にはGitHub Sponsorsを設定しています。

CIの対象はLinux上のNode.js 22/24です。モックを使った検証で、実車やシリアル接続の互換性を保証するものではありません。実際のnpm公開には権限を持つアカウントが必要です。公開後に取得・動作を確認してから、npm経由の導入案内やディレクトリ掲載を進めてください。

### npmレジストリへの公開

npmにはまだ公開していません（導入はGitHubリリースのtarballを使います）。公開にはメンテナー自身のnpmアカウントが必要です。npmのトークンをコミットしたり、IssueやPRに貼ったりしないでください。

1. **最初の1回は手作業で公開します。** npmの信頼された公開元（trusted publishing）は、既にあるパッケージにしか設定できないためです。二要素認証を有効にしたアカウントでnpmjs.comにサインインし、`npm view obd2-mcp` が404であることを確かめます。リリースのタグをチェックアウトし、`npm ci`・`npm test`・`npm run test:package` を実行して `npm pack --dry-run` の中身を確認したら、`npm login` → `npm publish --access public` で公開します。公開後は `npm view obd2-mcp version` で確認し、空のディレクトリで `npx -y obd2-mcp@<バージョン> --demo --summary --lang ja` を実行します。
2. **2回目以降は自動で公開します（トークン不要）。** npmjs.comの `obd2-mcp` → **Settings** → **Trusted Publisher** → **GitHub Actions** に、ユーザー `shoka-jp`、リポジトリ `obd2-mcp`、ワークフロー `npm-publish.yml`、環境 `npm` を登録します。続いてGitHubの **Settings** → **Secrets and variables** → **Actions** → **Variables** に `NPM_PUBLISH` = `true` を追加します。以後はGitHubリリースを公開すると、`.github/workflows/npm-publish.yml` がタグとバージョンの一致を確認し、テストを実行して、未公開のバージョンだけをnpmに公開します（出所を示すprovenanceも付きます）。`NPM_PUBLISH` がなければ何もしません。公開ごとに承認したい場合は、**Settings** → **Environments** → `npm` で自分を承認者に設定します。
3. **公開できたら、** 英日READMEと `docs/try-mock.md`・`docs/demo-results.md` の導入コマンドをtarballのURLから `obd2-mcp@<バージョン>` に変えます。`package.json` には MCPレジストリがnpmパッケージの持ち主を確認するための `mcpName` を設定済みなので、`server.json` に `.mcpb` と並べてnpmの項目を追加できます。
