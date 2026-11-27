# obd2-mcp

**[実際の出力を見る・AIクライアントなしでデモを実行する](./docs/demo-results.md)**

**開発に参加する：** [初めての方向けIssue](https://github.com/shoka-jp/obd2-mcp/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22)から選べます。[貢献ガイド](./CONTRIBUTING.md)もご覧ください。ドキュメント修正・テスト・質問を日本語でも歓迎します。[感想・質問を送る](https://github.com/shoka-jp/obd2-mcp/issues/new?template=first-experience.yml)（GitHub上で公開されます）。

![3ステップ：Claude Desktop拡張またはnpxでインストール、check_engine_lightプロンプトで模擬車両を試す、list_serial_portsでアダプタを確認して接続先を設定。最初は模擬データで、既定は読み取りのみ、実車のコード消去は無効です。](docs/images/get-started-ja.svg)

**車もAIクライアントも不要：** Node.js 22または24とnpmを用意し、ターミナルで次を実行してください。ビルド済みパッケージと依存ライブラリを取得するので、Gitの操作や手元でのビルド作業を省けます。

```bash
npm exec --yes --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.6.0/obd2-mcp-0.6.0.tgz -- obd2-mcp --demo --summary --lang ja
```

このリポジトリの[v0.6.0リリース](https://github.com/shoka-jp/obd2-mcp/releases/tag/v0.6.0)に添付したパッケージを取得し、模擬データと確認手順を表示して終了します。[出力例と確認事項を見る](./docs/demo-results.md)。

**模擬車両の結果例：** 記録コード `P0420`、記録時は時速98 km・2,210 rpm、現在値は時速0 km・740 rpm。模擬データであり、故障診断ではありません。[実際の取得結果と限界を見る](./docs/demo-results.md#observed-output--実際に取得した結果)。

ツールの応答全体を見る場合は `--summary --lang ja` を外します。開発やソースからのMCPクライアント接続は、下のクイックスタートを参照してください。

**初めての方へ：[車なしで試せるモック体験ガイド](./docs/try-mock.md#日本語)**

[English](./README.md) | **日本語**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Mock and package checks](https://github.com/shoka-jp/obd2-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/shoka-jp/obd2-mcp/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/shoka-jp/obd2-mcp)](https://github.com/shoka-jp/obd2-mcp/releases/latest)

安価なELM327アダプタ経由で、AIアシスタントが**あなたの車のOBD-IIデータを直接読める**ようにするMCPサーバーです。故障コード(DTC)、ライブセンサー、フリーズフレーム、レディネスモニタ、車台番号(VIN)に対応。

Claudeに「エンジン警告灯が点いたのはなぜ?」と聞くと、**実車から実際のコードを読み取り**、消える前にフリーズフレームを確保し、燃料補正を確認して原因を推論します — スキャナーの画面を手で書き写す必要はもうありません。

**アダプタがなくても動きます。** 内蔵のモック車両(暖機済みアイドリング中のセダン、P0420記録済み、警告灯点灯、リアルなライブデータ)で、アダプタを買う前にすべて試せます。

## 始め方を選ぶ

| やりたいこと | 始め方 | 必要なもの |
|---|---|---|
| AIクライアントも車もなしで、どんな結果が出るか見る | 上のデモコマンド | Node.js 22または24 |
| Claude Desktopで使う | [`.mcpb` 拡張機能をインストール](#claude-desktop拡張機能としてインストール) | Claude Desktop |
| Claude Codeなど他のMCPクライアントで使う | [`npx` でリリースパッケージを登録](#gitもビルドも使わない方法) | Node.js 22または24 |
| 中古車を買う前に確認する | [`used_car_check` プロンプトと使い方](./docs/used-car-check.md#日本語)。まず `--demo --summary --lang ja --scenario cleared` で試せます | ELM327アダプタと売り手の了承 |
| 自分の車のデータを読む | アダプタを挿してClaudeに「つないで」と頼む（[仕組み](#実車への接続)）。困ったら[トラブルシューティング](./docs/troubleshooting.md#日本語) | USB・Bluetooth（シリアル）・WiFiのELM327アダプタ |
| コードを変更する・開発に参加する | [ソースからビルド](#ソースからビルドする方法)と[貢献ガイド](./CONTRIBUTING.md) | GitとNode.js |

どの方法も最初は模擬車両で動くので、車につなぐ前に設定を確認できます。MCPクライアントでは、`check_engine_light` などの[ガイド付きプロンプト](#ガイド付きプロンプト)から始めると簡単です。

## Claude Desktop：拡張機能としてインストール

v0.4.0以降の各[GitHubリリース](https://github.com/shoka-jp/obd2-mcp/releases/latest)には、Claude Desktop用の拡張機能 `obd2-mcp-<バージョン>.mcpb` を添付します。Git・ビルド・JSONの編集は不要です。

1. リリースから `.mcpb` ファイルをダウンロードします。
2. Claude Desktopで開き（ダブルクリック、または **設定 → 拡張機能** からインストール）、インストールを確定します。
3. 「車の故障コードを読んで、お金をかける前に確認すべきことを教えて」と聞いてみてください。最初は模擬車両で動きます。

**実車のアダプタを使うときは、頼むだけです。** アダプタを車に挿してイグニッションをONにし（Bluetoothアダプタは先にPCの設定でペアリング、WiFiアダプタはそのWiFiに接続）、「車のアダプタにつないで」と頼みます。Claudeが `find_adapter` でUSB・Bluetoothアダプタを探し、確認のうえ `use_adapter` で接続します。ポート名の入力や再起動は不要です。接続はClaude Desktopを再起動するまで有効です。固定したいときは、拡張機能の設定で **Adapter connection** をClaudeが示した値（例：`serial:COM3`、`tcp:192.168.0.10:35000`）にします。拡張機能には依存パッケージと、Windows・macOS・Linux用のシリアル通信部品を同梱しています。リリース時の確認はLinux上の模擬車両で行っており、Windows・macOSへのインストールと実アダプタでの動作は未検証です。

## クイックスタート(モックモード — ハードウェア不要)

### Gitもビルドも使わない方法

Node.js 22または24とnpmがあれば、MCPクライアントからv0.6.0のリリースパッケージを直接起動できます。先にこのページ冒頭のデモコマンドを1回実行してください。パッケージがnpmのキャッシュに保存され、クライアントの初回起動でダウンロードを待たずに済みます（Windowsでの確認では約40秒かかりました）。

**Claude Code:**

```bash
claude mcp add obd2 -- npx -y --package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.6.0/obd2-mcp-0.6.0.tgz obd2-mcp
```

Windows（WSLではない環境）では `npx` の前に `cmd /c` を付けます。

**Claude Desktop**（`claude_desktop_config.json`）:

```json
{
  "mcpServers": {
    "obd2": {
      "command": "npx",
      "args": ["-y", "--package=https://github.com/shoka-jp/obd2-mcp/releases/download/v0.6.0/obd2-mcp-0.6.0.tgz", "obd2-mcp"]
    }
  }
}
```

Windowsでは `"command": "cmd"` とし、`args` の先頭に `"/c", "npx"` を加えます。Claude Desktopが `npx` を見つけられない場合は、フルパス（macOS/Linuxは `which npx`、Windowsは `where npx` で確認）を指定してください。実車のアダプタを使う場合は `"env": {"OBD2MCP_CONNECTION": "serial:COM3"}` を追加します（[実車への接続](#実車への接続)を参照）。URLはv0.6.0を指しているため、更新するときはURLを変更してください。

### ソースからビルドする方法

GitとNode.js/npmを用意し、ソースからビルドします。npm経由で導入する場合は、先にパッケージの公開状況を確認してください。

```bash
git clone https://github.com/shoka-jp/obd2-mcp.git
cd obd2-mcp
npm ci
npm run build
node -p "require('node:path').resolve('dist/index.js')"
```

以下の `/absolute/path/to/obd2-mcp/dist/index.js` は最後のコマンドで表示された実際の絶対パスに置き換えてください。WindowsのJSON設定では区切り文字に `/` を使用できます。

**Claude Code:**

```bash
claude mcp add obd2 -- node "/absolute/path/to/obd2-mcp/dist/index.js"
```

**Claude Desktop**(`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "obd2": {
      "command": "node",
      "args": ["/absolute/path/to/obd2-mcp/dist/index.js"]
    }
  }
}
```

そして聞いてみてください:「車の故障コードを読んで、お金を使う前に確認すべきことを教えて」

### 別のモックシナリオを試す

MCPクライアントの設定で `OBD2MCP_CONNECTION=mock` と合わせて `OBD2MCP_MOCK_SCENARIO` を指定できます。`catalyst`（既定、P0420）、`healthy`（コードなし）、`misfire`（P0301）、`lean`（P0171と高めのバンク1燃料補正）、`evap`（P0456 蒸発ガス系の微小リーク）、`cleared`（最近コードを消した車：記録済みコードなし・警告灯消灯だが、消去しても残るP0420と未完了のモニターが3つ。`used_car_check` プロンプトで試せます）から選べます。いずれも学習用の模擬データで、実車の故障診断や車両プロファイルを保証するものではありません。未対応のシナリオ名では起動を停止します。実車接続時にはこの設定を使用しません。

たとえばClaude Codeに別のモックサーバーを登録します。

```bash
claude mcp add obd2-lean --env OBD2MCP_CONNECTION=mock --env OBD2MCP_MOCK_SCENARIO=lean -- node "/absolute/path/to/obd2-mcp/dist/index.js"
```

設定変更後はサーバーを再起動してください。モックの状態はサーバーごとに独立しています。モックの消去はレディネスをリセットします（消去しても残るコードは実車と同じく残ります）。実車には影響しません。

MCPクライアントなしでシナリオを確認するには、デモのコマンドに `--scenario` を付けます。例：`obd2-mcp --demo --summary --lang ja --scenario cleared`

## ガイド付きプロンプト

何を聞けばよいか分からないときは、用意された4つのプロンプトを使えます。Claude Desktopでは添付（＋）メニューのサーバー名の下に表示され、Claude Codeでは `/mcp__obd2__check_engine_light` のようなスラッシュコマンドとして使えます。

| プロンプト | 内容 |
|---|---|
| `check_engine_light` | 整備相談レポートを取得し、各故障コードを平易に説明します。フリーズフレームと現在値を分け、整備工場へ行く前に確認できる安価な点検を挙げます。症状と返答言語（例：日本語）を任意で指定できます。 |
| `workshop_handover` | レポートを整備士に渡す短いメモにまとめます。未取得の値やエラーを残し、車台番号や個人情報は含めません。 |
| `used_car_check` | 購入を検討している中古車向けです。売り手の了承を得たうえで、故障コード・消去しても残るコード（`read_permanent_dtcs`）・レディネスモニターを読み、最近コードを消した可能性を「証拠」ではなく「確認すべき質問」として示し、試乗後の再確認を提案し、売り手への質問と購入前点検で見てもらう点をまとめます。売り手の説明と返答言語を任意で指定できます。[使い方](docs/used-car-check.md#日本語) |
| `connect_adapter` | `list_serial_ports` などでUSB・Bluetooth・WiFiアダプタの設定値を調べ、設定方法を案内し、再起動後に接続を確認します。 |

サーバーは接続時にも使い方の指示を送るため、プロンプトを使わなくても、Claudeは模擬データの明示、対応センサーの事前確認、コードを消去しないことを把握できます。プロンプトはClaudeへの指示文で、車両へのアクセスは読み取り専用のツールを通じて行います。コードを消去しない、車台番号を要求しない、模擬データや未取得の値を明示する、と指示しています。

## 整備相談レポート

MCPサーバーをクライアントに設定すると、**「read_diagnostic_reportを実行し、観測値・未取得項目・エラーを整備相談用のメモにまとめて。フリーズフレームと現在値は分けて」**と依頼できます。

故障コード・フリーズフレーム・ライブセンサー・レディネスを1回の呼び出しで取得し、取得時刻付きのJSONにまとめます。既存の読み取り処理を利用し、一部が取得できなくても、ほかの結果と未取得項目・エラーを残します。順番に読み取るため、同一瞬間の値とは限りません。

必要なライブセンサーだけを読み取るには、たとえば `{"pids":["rpm","coolant_temp"]}` のようにPIDの**名前**を指定します。`pids`を省略するか空配列にすると、`read_live_data`と同じ既定の項目を取得します。不明な名前はセンサーごとのエラーとして残し、ほかの指定項目は引き続き読み取ります。この指定が適用されるのはライブデータだけで、故障コード・フリーズフレーム・レディネスは通常どおり収集します。

VINの取得やコード消去は行わず、接続元を示す`source`フィールドも省きます。エラー文には機器情報が含まれる場合があるため、共有前に本文を確認してください。MCPクライアント側で保存・整形して相談に使う記録であり、実車の故障診断を確定するものではありません。

## 実車への接続

ELM327互換アダプタ（USB / Bluetoothシリアル / WiFi）をOBD-IIポートに接続し、イグニッションをONにします。対応状況は車種・販売地域・通信規格・アダプタ・接続方式によって異なり、このプロジェクトでは実車とアダプタの組み合わせをまだ検証していません。停車中に読み取り専用の確認から始めてください。アダプタへの接続だけでは車両との通信は確認できません。

**かんたんな方法：** MCPクライアントに「車のアダプタにつないで」と頼みます。`find_adapter` は、アダプタらしいポート（既知のUSBシリアル変換チップやBluetoothのシリアルポート）だけに識別コマンド（`ATZ`）を送り、車両には何も送りません。そのうえで `use_adapter` が、アダプタの応答を確認してからこのセッションの接続先を切り替えます。安全のため、`use_adapter` が受け付けるのはシリアルポート名と家庭内ネットワークのWiFiアドレスだけで、コード消去は無効のままです。

接続先を固定するときは、環境変数またはCLIフラグで指定します:

| アダプタ | 設定 |
|---|---|
| USB / Bluetooth(シリアル) | `OBD2MCP_CONNECTION=serial:COM3`(Windows)/ `serial:/dev/ttyUSB0`(Linux)/ `serial:/dev/tty.usbserial-XXXX`(macOS) |
| WiFi | `OBD2MCP_CONNECTION=tcp:192.168.0.10:35000` |
| モック(デフォルト) | `OBD2MCP_CONNECTION=mock` |

**シリアルポート名を調べる：** MCPクライアントで `list_serial_ports` を実行するか、ターミナルで `node dist/index.js --list-ports` を実行します。OSが認識しているポートと、そのまま使える `serial:` の設定値を一覧表示します。ポートを開いたり車両と通信したりはしません。どれがアダプタか分からない場合は、アダプタを抜く（またはペアリングを解除する）前後で一覧を比べてください。既知のUSBシリアルチップ（FTDI・CH340・PL2303・CP210x）の表示は目安で、OBD-IIアダプタであることの証明ではありません。一覧表示には任意依存の `serialport` が必要です。WiFiアダプタは表示されません。

シリアルのボーレートは既定38400。必要なら`OBD2MCP_BAUD=115200`で変更。BluetoothアダプタはOS側でペアリングしてシリアルポートとして見える状態にしてください。

接続先・ポート番号・ボーレートの形式が正しくない場合は、該当する設定名を示して起動を中止します。IPv6アドレスは `tcp:[fe80::1]:35000` のように角括弧で囲んで指定します。

WiFiアダプターに10秒以内に接続できない場合はタイムアウトのエラーを返します。PCがアダプターのネットワークに接続されているか確認し、サーバーを再起動してから再度お試しください。

ポート・ペアリング・権限・車両の応答で困ったときは、[接続のトラブルシューティング](./docs/troubleshooting.md#日本語)を参照してください。

**実車で試しましたか？** 動いた場合も動かなかった場合も、[動作報告](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml)をお願いします。報告は[動作報告のあった環境](./docs/compatibility.md#日本語)に掲載します（現時点でプロジェクトとして検証済みの環境はありません）。

実車接続でのClaude Code登録例:

```bash
claude mcp add obd2 --env OBD2MCP_CONNECTION=serial:COM3 -- node "/absolute/path/to/obd2-mcp/dist/index.js"
```

## 対応するライブセンサーの確認

センサーを選ぶ前に、MCPクライアントで `read_supported_pids` を実行できます。このサーバーが使用する16進数のPID `01`〜`60` の範囲について、後続の対応表があることを示すビットを確認しながらMode 01の対応情報を読み取ります。返された `supported_sensor_names` を、`read_live_data` や `read_diagnostic_report` の `pids` に指定できます。

センサーごとに `supported`（車両が対応を通知）、`not_advertised`（対応ビットまたは後続の対応表の通知なし）、`unknown`（必要な応答を取得できず不明）を区別します。途中で失敗した場合は `complete: false` とツールエラーを返し、それまでの結果と失敗したリクエストを残します。`NO DATA`・不足した応答・曖昧な応答を「非対応」の証拠として扱いません。呼び出しごとに再取得し、センサー値の読み取り・VIN取得・コード消去は行いません。

次の読み取りに渡すのは、**1件以上**の対応センサー名にしてください。`pids: []` は引き続き既定の項目を取得します。対応の通知は値の取得成功を保証せず、`complete` は上記のPID範囲だけを指します。モックとプロトコルのテストによる検証であり、実車・アダプターとの互換性は未検証です。

プロトコルの参考資料：[ELM327データシートの「Talking to the Vehicle」](https://elmelectronics.com/wp-content/uploads/2020/05/ELM327DSL.pdf)、[python-OBDのコマンド表](https://python-obd.readthedocs.io/en/latest/Command%20Tables/)。

## ツール一覧

| ツール | 内容 |
|---|---|
| `read_supported_pids` | ライブセンサーの対応通知を確認。不明や途中の取得失敗を保持 |
| `read_diagnostic_report` | 4種類の読み取り結果を取得時刻・未取得項目・エラー付きでまとめる整備相談用レポート。ライブセンサーを選択可能 |
| `read_dtcs` | 記録済み・保留中の故障コード、警告灯の状態、コード数。アダプターがデータを返さない場合、該当する一覧は `null`（未確認）です。 |
| `read_permanent_dtcs` | 消去しても残る故障コード（Mode 0A）。修理が確認されるまで残るため、最近コードを消したかどうかの手がかりになります（中古車の確認など）。非対応の車（2010年頃より前に多い）では `null` で、「コードなし」の確認ではありません。 |
| `read_freeze_frame` | フリーズフレームを記録させたDTCと、その瞬間のエンジン状態 |
| `read_live_data` | ライブセンサー:回転数、水温、燃料補正、MAF、O2電圧など(23 PID) |
| `read_readiness` | レディネスモニタの完了状態(検査に通る状態かの判定材料)。対応数・完了数と未完了の一覧も返します。コード消去やバッテリーの取り外しでリセットされます。 |
| `read_vin` | ECUから車台番号を読み取り |
| `connection_status` | アダプター情報と取得できた場合のポート電圧。アダプターへの接続だけでは車両との通信は確認できません。 |
| `find_adapter` | USB・Bluetoothの ELM327 アダプタを自動で探す。アダプタらしいポートだけを短時間開いて識別コマンド `ATZ` を送り、車両には何も送りません |
| `use_adapter` | 見つかったアダプタに、設定の編集や再起動なしでこのセッションを接続（モックにも戻せます）。先にアダプタの応答を確認し、失敗したら元の接続のままです。シリアルポート名と家庭内ネットワークのWiFiアドレスだけを受け付けます |
| `list_serial_ports` | このPCのシリアルポートと `serial:` の設定値を一覧表示し、USB・Bluetoothアダプタの接続先を探す。ポートは開かず、モックモードでも使えます |
| `clear_dtcs` | コード消去 — **実車では初期状態で無効**。フリーズフレームが消え、モニタがリセットされます |

## automotive-ai-skills との連携 🔧

このサーバーは「道具」レイヤーです。「知識」レイヤー — コードから原因への推論方法、部品を買う前に試すべきテスト、プロに任せる境界 — は [automotive-ai-skills](https://github.com/shoka-jp/automotive-ai-skills) が担います:

```text
/plugin marketplace add shoka-jp/automotive-ai-skills
/plugin install automotive-ai-skills@automotive-ai-skills
claude mcp add obd2 -- node "/absolute/path/to/obd2-mcp/dist/index.js"
```

両方入れると、Claudeが実車からコードを読み、**その上で診断ワークフローを回します**。

## 安全設計とスコープ

- **実車のコード消去は初期状態で無効です。** モード04を使うには、サーバー起動前に `OBD2MCP_ENABLE_CLEAR=1` を設定し、`confirm` 引数を true にしたうえで、別途表示されるMCP確認フォームで承認してください。フォーム確認に非対応のクライアントでは実車の消去はできません。確認が人に提示されることはクライアントに依存し、サーバー側では承認者の本人確認はできません。モックでは消去をテストできます。
- **ツールの注釈。** 各ツールに表示用のタイトルを付けています。読み取りツールは読み取り専用、`clear_dtcs` は破壊的な操作として注釈しているため、MCPクライアントが表示や確認の方法を区別できます。注釈はクライアント向けの目安であり、上記の保護に代わるものではありません。
- **応答の制限。** 複数ECUの応答や混在した応答、未対応の圧縮着火エンジンのレディネスは、推測せずエラーを返します。車台番号の読み取りは、データ項目数 `01` に続く有効な17文字のCAN形式の応答に対応し、それ以外の形式ではエラーを返します。アダプターのタイムアウトや切断後はサーバーを再起動してください。実車とアダプターでの互換性は別途確認が必要です。
- **診断の支援であって、判決ではありません。** コードは「失敗したテスト」を示すもので「壊れた部品」ではありません。お金を使う前に物理テストで確定させ、安全系(ブレーキ、燃料、SRS、高電圧)はプロに任せてください。
- 運転しながらAIとやり取りしないでください。読み取りは停車中に。
- **安全やセキュリティに関わる問題を見つけたら、** 公開Issueではなく[SECURITY.md](./SECURITY.md#日本語)の手順で非公開で報告してください。

## 開発

```bash
git clone https://github.com/shoka-jp/obd2-mcp.git
cd obd2-mcp
npm ci
npm test        # ビルド+モック車両に対するstdioスモークテスト
npm run test:package  # 配布用tarballを別環境へインストールして検証
npm run build:mcpb    # Claude Desktop拡張機能を build/mcpb に準備（docs/releasing.md 参照）
node dist/index.js --help  # コマンドラインのオプションと環境変数の一覧
```

モック車両はELM327プロトコルレベルで応答するため、テストはパース系全体(マルチフレームのVIN応答含む)を通ります。

## ロードマップ

現在のリリース状況、今後の改善案、参加方法は[開発ロードマップ](./docs/roadmap.ja.md)をご覧ください。優先順位は利用者の声に応じて見直し、公開時期は確約していません。

## プロジェクトを応援する

役立った方は、次の方法で開発を応援していただけます。

- [開発者をフォロー](https://github.com/shoka-jp)して、自動車 × AIの開発をチェックする。
- リポジトリをStarして保存したり、必要としている人に紹介する。
- [Issue](https://github.com/shoka-jp/obd2-mcp/issues)で、試した手順・期待した結果・実際の結果を共有する。ログから車台番号などの個人情報を取り除いてください。
- [GitHub Sponsors](https://github.com/sponsors/shoka-jp)でオープンソース活動を支援する。

## ライセンス

[MIT](./LICENSE) © 2026 Sho Kamakura
