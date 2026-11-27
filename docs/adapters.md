# Choosing and plugging in an OBD-II adapter / OBD-IIアダプタの選び方と差し方

[English](#english) | [日本語](#日本語)

This project has not yet verified any real adapter or vehicle, and does not recommend a specific product. This page explains which kinds of adapters can work with obd2-mcp on a computer, so you can avoid buying one that cannot.

このプロジェクトはまだ実際のアダプタや車両で検証しておらず、特定の製品を推奨するものではありません。このページでは、パソコンのobd2-mcpで使えるアダプタの種類を説明し、使えないものを買わずに済むようにします。

## English

### Which adapters can work

obd2-mcp talks to **ELM327-compatible** adapters, the common low-cost kind. Check the product description for "ELM327". What matters next is **how it connects to your computer**:

| Connection | Works with obd2-mcp on a computer? | Notes |
|---|---|---|
| **USB cable** | Yes | The simplest choice. The computer may need a driver for the adapter's USB chip (often CH340, FTDI, PL2303 or CP210x); Windows usually installs it automatically. |
| **Bluetooth "Classic" (SPP)** | Yes | Pair it in the computer's Bluetooth settings first. Descriptions often say it supports Windows or Android. |
| **Bluetooth LE only** (often labeled "BLE" or "Bluetooth 4.0" and sold for iPhone) | **No** | It does not appear as a serial port on the computer, so obd2-mcp cannot use it. Some adapters support both kinds of Bluetooth; check that the description also mentions Windows or Android. |
| **WiFi** | Yes | Your computer joins the adapter's own WiFi network, so the internet may stop working while connected. The address is often `192.168.0.10`, port `35000`; check the manual. |

Very cheap copies sometimes behave unreliably. If connecting keeps failing even with the ignition on, the adapter itself may be the cause.

### Where to plug it in

The OBD-II port is a 16-pin socket, usually **under the dashboard on the driver's side**, within reach of the steering wheel; sometimes it is behind a small cover. The car's owner's manual shows the exact place.

### Before and after

- Park safely. Turn the **ignition on** (the engine can stay off, or idle outdoors).
- Do not drive with a cable or adapter in the way of the pedals.
- **Unplug the adapter when you are done.** Many adapters draw power all the time and can drain the battery if left in for days.

### Then connect

With obd2-mcp v0.6.0 or later, ask Claude: *"Connect to my car's adapter."* It finds a USB or Bluetooth adapter and connects after asking you. For a WiFi adapter, join its network first; Claude then tries the usual address or the one you read from the manual. If something fails, Claude explains the next step, and the [troubleshooting guide](./troubleshooting.md) has more.

## 日本語

### 使えるアダプタ

obd2-mcpは、広く出回っている安価な **ELM327互換** アダプタに対応しています。商品説明に「ELM327」とあるか確認してください。次に大事なのは、**パソコンとのつなぎ方**です。

| つなぎ方 | パソコンのobd2-mcpで使えるか | 注意点 |
|---|---|---|
| **USBケーブル** | 使えます | いちばん簡単です。アダプタのUSBチップ（CH340、FTDI、PL2303、CP210xなど）のドライバーが必要な場合がありますが、Windowsでは多くが自動で入ります。 |
| **Bluetooth（クラシック、SPP）** | 使えます | 先にパソコンのBluetooth設定でペアリングします。商品説明に「Windows対応」「Android対応」とあることが多いです。 |
| **Bluetooth LEのみ**（「BLE」「Bluetooth 4.0」と書かれ、iPhone向けとして売られていることが多い） | **使えません** | パソコンにシリアルポートとして現れないため、obd2-mcpから使えません。両方のBluetoothに対応した製品もあるので、商品説明にWindowsやAndroid対応ともあるか確認してください。 |
| **WiFi** | 使えます | パソコンをアダプタ自身のWiFiにつなぐため、接続中はインターネットが使えなくなることがあります。アドレスは `192.168.0.10`、ポート `35000` が多いですが、説明書で確認してください。 |

極端に安いコピー品は動作が不安定なことがあります。イグニッションをONにしても接続に失敗し続ける場合は、アダプタ自体が原因の可能性もあります。

### 差し込む場所

OBD-IIポートは16ピンのコネクタで、多くは**運転席側のダッシュボード下**、ハンドルの近くにあります。小さなカバーの裏にあることもあります。正確な場所は車の取扱説明書で確認できます。

### 使う前と使ったあと

- 安全な場所に停車し、**イグニッションをON**にします（エンジンは止めたまま、または屋外でアイドリング）。
- ケーブルやアダプタがペダルの邪魔になる状態で運転しないでください。
- **使い終わったらアダプタを抜きます。** 常に電気を使うアダプタが多く、何日も挿したままだとバッテリーが上がることがあります。

### つなぐ

obd2-mcp v0.6.0以降では、Claudeに「車のアダプタにつないで」と頼むだけです。USB・Bluetoothのアダプタを探し、確認のうえ接続します。WiFiアダプタの場合は先にそのWiFiにつなぐと、Claudeが一般的なアドレスか、説明書に書かれたアドレスで接続を試します。うまくいかないときはClaudeが次の手順を説明します。詳しくは[トラブルシューティング](./troubleshooting.md#日本語)を参照してください。
