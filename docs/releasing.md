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
4. Download the published assets, compare them with `SHA256SUMS`, and run the README demo command from a fresh directory in English and Japanese. Install the `.mcpb` in Claude Desktop on at least one desktop platform and confirm the mock vehicle, `list_serial_ports` and a guided prompt respond.

To build locally instead: `npm ci`, `npm pack`, `npm run build:mcpb`, then `npx @anthropic-ai/mcpb pack build/mcpb obd2-mcp-<version>.mcpb`.

GitHubリリースでは、npmパッケージ（`.tgz`）とClaude Desktop拡張機能（`.mcpb`）を配布します。`Release packages` ワークフローがPRと `main` へのpushごとに両方を作成し、利用者と同じ方法で起動を確認します。バージョン・CHANGELOG・READMEのURLを更新したコミットを `main` にマージし、そのコミットに `v<バージョン>` のタグを付けたリリースを公開すると、`.tgz`・`.mcpb`・`SHA256SUMS` が自動で添付されます。ファイルのバージョンがタグと一致しない場合は添付しません。公開後は再ダウンロードしてハッシュを照合し、READMEの英日コマンドを確認したうえで、少なくとも1つのOSのClaude Desktopに `.mcpb` を入れて、模擬車両・`list_serial_ports`・ガイド付きプロンプトが応答することを確認してください。

## npm registry publishing checklist for an authorized maintainer

1. Check the current package name, version, license, and account ownership. A missing registry package is not proof that the name is available to your account.
2. Run the verification commands above and inspect `npm pack --dry-run`.
3. Complete npm authentication using npm's supported flow; never commit tokens or paste credentials into issues.
4. Publish the reviewed version using the authorized account. This repository's CI does not publish automatically.
5. Verify the published version with `npm view obd2-mcp version` and test a clean installation of that exact version against the mock vehicle.
6. Only then update installation instructions and submit to applicable MCP directories.

Sources: [npm lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/), [npm publish](https://docs.npmjs.com/cli/commands/npm-publish/).

## 日本語

`npm ci` → `npm test` → `npm run test:package` で、npmログインなしで配布物を検証できます。最後のコマンドは、ビルド成果物のない一時ディレクトリからパッケージを作成し、別ディレクトリへインストールしてモックテストとデモを実行します。公開はしません。

`npm pack` と `npm publish` の前に自動ビルドし、英日README・デモ資料・サンプル・貢献ガイドを同梱します。npmの支援情報にはGitHub Sponsorsを設定しています。

CIの対象はLinux上のNode.js 22/24です。モックを使った検証で、実車やシリアル接続の互換性を保証するものではありません。実際のnpm公開には権限を持つアカウントが必要です。公開後に取得・動作を確認してから、npm経由の導入案内やディレクトリ掲載を進めてください。
