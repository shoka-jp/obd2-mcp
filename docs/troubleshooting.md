# Connection troubleshooting / 接続のトラブルシューティング

[English](#english) | [日本語](#日本語)

This project has not yet verified a real vehicle or adapter combination. The steps below are general operating-system and ELM327 guidance, not tested compatibility claims. Work with the vehicle safely parked, the ignition on, and the engine off or idling outdoors.

## English

### Start with the mock vehicle

If the server does not start at all, check it without hardware first: run `obd2-mcp --demo --summary` (or the README demo command) and `obd2-mcp --help`. A message that names a setting, such as `Invalid OBD2MCP_BAUD` or `Unknown argument`, points to the configuration rather than the adapter.

### Find the right connection value

Ask Claude to run `list_serial_ports`, or run `obd2-mcp --list-ports`. To identify the adapter, unplug or unpair it, list again, and see which entry disappeared. Use the listed `serial:` value as `OBD2MCP_CONNECTION` (or the Claude Desktop extension's **Adapter connection**) and restart the server.

If listing fails because the optional `serialport` package is missing, reinstall where npm can install it, or use a WiFi adapter (`tcp:<host>:<port>`).

### Bluetooth adapters

- Pair the adapter in the operating system first. Only classic Bluetooth adapters that provide a serial port (SPP) appear as a serial port.
- Many low-cost "Bluetooth 4.0 / BLE" adapters do not create a serial port on a computer, so they cannot be used with `serial:`.
- **Windows:** a paired SPP device can get two COM ports. In Bluetooth settings → More Bluetooth settings → COM Ports, use the one marked **Outgoing**.
- **macOS:** if opening a `/dev/tty.*` path waits without a response, try the matching `/dev/cu.*` path.

### USB adapters

- **Linux:** `Permission denied` on `/dev/ttyUSB0` or `/dev/ttyACM0` usually means your user is not in the serial group. On Debian and Ubuntu: `sudo usermod -aG dialout $USER`, then sign out and in again. Other distributions may use a different group, such as `uucp`.
- **Windows:** `Access denied` or a busy port usually means another program, such as a scanner app, still has the COM port open. Close it and try again.
- If the adapter replies with garbage or not at all, try `OBD2MCP_BAUD=115200` or `9600`. The default is 38400.

### WiFi adapters

- The computer must join the adapter's WiFi network. It often has no internet access while connected.
- Many adapters use `tcp:192.168.0.10:35000`; check the adapter's manual for its address and port.
- A connection that is not accepted within 10 seconds fails with a timeout. Check the network and the address, and check that a firewall does not block the connection.

### The adapter answers, but the vehicle does not

- `connection_status` confirms the adapter only (`vehicle_communication: not_checked`).
- `UNABLE TO CONNECT`, `BUS INIT` or `CAN ERROR` usually means the adapter could not talk to the vehicle: check that the ignition is on and the adapter is fully seated in the OBD-II port.
- `NO DATA` for one reading means the vehicle did not answer that request. Run `read_supported_pids` and request only supported sensors. A missing reading is not a clean result.
- Some adapters, including low-cost clones, do not support every ELM327 command.

### After a timeout or disconnect

The server does not reconnect automatically yet. Restart the MCP server (or the client) before trying again.

### Report what you found

Open a [real setup report](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml) with the operating system, adapter type and model, connection type, what you ran, and the error text. It also helps when something works: reported setups are listed in [compatibility](./compatibility.md). Remove the VIN, licence plate, names, contact details, credentials and private network addresses first. Reports from real setups help the project document which combinations work.

## 日本語

このプロジェクトでは、実車とアダプタの組み合わせをまだ検証していません。以下はOSとELM327に関する一般的な手順で、動作を保証するものではありません。作業は安全な場所に停車し、イグニッションON、エンジン停止または屋外でのアイドリング状態で行ってください。

### まず模擬車両で確認する

サーバー自体が起動しない場合は、ハードウェアなしで `obd2-mcp --demo --summary`（またはREADMEのデモコマンド）と `obd2-mcp --help` を実行します。`Invalid OBD2MCP_BAUD` や `Unknown argument` のように設定名を示すメッセージは、アダプタではなく設定の問題です。

### 正しい接続先を調べる

Claudeに `list_serial_ports` を実行してもらうか、`obd2-mcp --list-ports` を実行します。どれがアダプタか分からないときは、抜く（ペアリングを解除する）前後で一覧を比べます。表示された `serial:` の値を `OBD2MCP_CONNECTION`（Claude Desktop拡張機能では **Adapter connection**）に設定し、サーバーを再起動します。

任意依存の `serialport` がないため一覧表示できない場合は、npmがインストールできる環境で入れ直すか、WiFiアダプタ（`tcp:<ホスト>:<ポート>`）を使ってください。

### Bluetoothアダプタ

- 先にOSでペアリングします。シリアルポート（SPP）を提供する従来型Bluetoothのアダプタだけが、シリアルポートとして表示されます。
- 安価な「Bluetooth 4.0／BLE」アダプタの多くは、パソコンにシリアルポートを作らないため、`serial:` では使えません。
- **Windows:** SPP機器には2つのCOMポートが割り当てられることがあります。Bluetoothの設定 →「その他のBluetooth設定（オプション）」→「COMポート」で、**発信**と表示されたポートを使います。
- **macOS:** `/dev/tty.*` を開いたまま応答がない場合は、対応する `/dev/cu.*` を試してください。

### USBアダプタ

- **Linux:** `/dev/ttyUSB0` や `/dev/ttyACM0` で `Permission denied` になる場合、多くはユーザーがシリアル用のグループに入っていません。Debian・Ubuntuでは `sudo usermod -aG dialout $USER` を実行し、ログインし直します。ディストリビューションによっては `uucp` など別のグループです。
- **Windows:** `Access denied` やポート使用中のエラーは、多くの場合ほかのソフト（診断アプリなど）がCOMポートを開いたままです。閉じてから再度お試しください。
- 応答が文字化けする、または応答がない場合は、`OBD2MCP_BAUD=115200` または `9600` を試します。既定は38400です。

### WiFiアダプタ

- パソコンをアダプタのWiFiに接続します。接続中はインターネットにつながらないことがよくあります。
- 多くのアダプタは `tcp:192.168.0.10:35000` ですが、アドレスとポートはアダプタの説明書で確認してください。
- 10秒以内に接続できない場合はタイムアウトになります。ネットワークとアドレスに加え、ファイアウォールが接続を妨げていないか確認してください。

### アダプタは応答するが車両が応答しない

- `connection_status` で確認できるのはアダプタまでです（`vehicle_communication: not_checked`）。
- `UNABLE TO CONNECT`・`BUS INIT`・`CAN ERROR` は、多くの場合アダプタが車両と通信できていません。イグニッションがONか、アダプタがOBD-IIポートの奥まで差し込まれているか確認します。
- 個別の読み取りで `NO DATA` になるのは、車両がその要求に応答しなかったためです。`read_supported_pids` で対応センサーを確認し、対応しているものだけを要求します。値がないことは「異常なし」を意味しません。
- 安価な互換品を含め、すべてのELM327コマンドに対応していないアダプタもあります。

### タイムアウトや切断のあと

現在は自動で再接続しません。MCPサーバー（またはクライアント）を再起動してから再度お試しください。

### 結果を報告する

OS、アダプタの種類と型番、接続方法、実行した操作、エラーの文面を添えて[実機での動作報告](https://github.com/shoka-jp/obd2-mcp/issues/new?template=hardware-report.yml)を作成してください。うまく動いた場合の報告も役立ちます。報告のあった環境は[動作報告のあった環境](./compatibility.md#日本語)に掲載します。車台番号、ナンバー、氏名・連絡先、認証情報、非公開ネットワークアドレスは事前に削除してください。実際の環境での報告は、動作する組み合わせを記録するのに役立ちます。
