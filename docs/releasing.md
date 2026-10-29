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

## Publishing checklist for an authorized maintainer

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
