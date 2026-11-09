# Phone app prototype / スマートフォンアプリの試作

This source prototype is intended for Android and iPhone. It is **not yet an
App Store or Google Play release**, and it has not been tested with a physical
phone, adapter, or vehicle. The native TCP dependency is reported as untested
on React Native's New Architecture by Expo Doctor; native builds and real
devices need verification before distribution.

The app has a fictional sample and experimental read-only connections for a
Wi-Fi ELM327-compatible adapter with a TCP interface or a Bluetooth Low Energy
(BLE) adapter with a supported GATT layout. It shows stored and
pending codes, the warning-light status, selected current values and freeze
frame values when available. Missing, inconsistent and unsupported responses
remain unknown. It can open the system sharing sheet with a workshop note.
The app does not request a VIN, clear codes, contact an AI service or
automatically send readings. A code is not a diagnosis. Do not operate while
driving; use a qualified professional for safety-critical work.

BLE scanning lists nearby devices; the user must choose and confirm their own
adapter. No device is connected automatically. The current BLE layouts are
FFF0/FFF1/FFF2, FFE0/FFE1, 18F0/2AF0/2AF1 and Nordic UART. These are protocol
implementations, not a compatibility guarantee: the prototype has not been
tested on a physical phone or adapter. Classic Bluetooth, USB and other
protocols are not implemented. BLE is distinct from classic Bluetooth; the
adapter's documentation must explicitly indicate BLE support.

Android 12+ asks for nearby-device access. On Android 11 and earlier, BLE
scanning requires location permission; the app does not obtain or derive the
phone's location. Scanning and device connections stop when the app goes to
the background. The Wi-Fi IP and port are examples, not compatibility
guarantees. Some phones may lose Internet access while on an adapter's Wi-Fi.
iPhone may ask for Bluetooth or local-network access. Use only devices and
networks you trust.

The current Expo/React Native defaults target Android SDK 36. Before targeting
SDK 37 or later, add and verify Android's `ACCESS_LOCAL_NETWORK` runtime
permission flow; Android 17 enforces this permission for apps targeting 37+.

## Development

Use Node.js 22 or 24. From this directory:

```bash
npm ci
npm test
npm run typecheck
npm run lint
npx expo export --platform all
```

The CI workflow also exercises the phone's command queue and parser over a
real local TCP stream with the independently maintained, MIT-licensed
[elmulator](https://github.com/qadanm/elmulator). It tests a fictional
headerless response and rejects unexpected header-bearing responses as
unknown. To run that optional check locally:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --only-binary=:all: --require-hashes -r tests/elmulator-requirements.txt
.venv/bin/python -m elmulator validate tests/fixtures/headerless.scenario.json
ELMULATOR_PYTHON=.venv/bin/python npm run test:elmulator
```

This Node TCP test does not exercise the phone's native socket module or
replace testing with a real adapter and vehicle. The simulator is a test-only
dependency and is not bundled in the app.

The browser export is **sample-only**; it cannot connect to an adapter. The
TCP and BLE libraries contain native code, so real connections require a custom native
development build; Expo Go alone is insufficient. To create local builds use
`npx expo run:android` with Android Studio/SDK or `npx expo run:ios` with Xcode
on macOS. iPhone device distribution also requires appropriate Apple signing.
The sample application identifiers in `app.json` must be reviewed for the
maintainer's accounts before distribution.

The ELM and DTC parsers in `src/core/vendor/` are copied from the server at the
repository root. A test checks that they remain identical; update and review
both copies together. The application additionally applies an allowlist that
excludes mode 04, mode 09 and arbitrary commands.

The app icon is rendered from the companion Automotive AI Skills project logo.

## References for future connections

- [shinyorg/obd](https://github.com/shinyorg/obd) separates Wi-Fi, BLE and
  classic Bluetooth transports. Generic classic Bluetooth support should not
  be assumed on iPhone.
- [react-native-ble-plx](https://github.com/dotintent/react-native-ble-plx)
  provides this prototype's BLE scanning and transport. It does not cover
  classic Bluetooth; its behavior with physical devices is unverified.
- [ReDrive](https://github.com/iUnreallx/ReDrive) is a reference for adapter
  selection and a demo mode. Its GPL-3.0 source is not included here.

## 日本語

Android・iPhone向けの**ソースコード段階の試作**です。ストアでは配布しておらず、実際のスマホ・アダプター・車両での検証もまだです。通信ライブラリは新しいReact Native構成での互換性が未確認と報告されているため、配布前に両OSのビルドと実機確認が必要です。

架空のサンプルを見たり、TCP対応のWi-Fi型または対応する通信方式のBluetooth LE型ELM327互換アダプターから、保存・保留コード、警告灯、取得できた現在値と記録時の値を読み取ったりする設計です。取得できない値は「不明」として扱い、整備士向けメモを端末の共有画面で共有できます。車台番号は取得せず、コード消去やAIへの自動送信も行いません。コードだけでは故障を確定できません。運転中は操作せず、安全に関わる作業は専門家に依頼してください。

Bluetooth LEは試作段階で、機器を検索後、利用者が自分の診断機を選んで確認してから接続します。従来型BluetoothやUSBは未対応です。BLEと従来型Bluetoothは別方式のため、診断機の説明書でBLEへの対応を確認してください。Android 12以降では付近のデバイスの許可、Android 11以前では検索に位置情報の許可が必要ですが、アプリは位置情報を取得・推定しません。アプリを離れると検索・接続を終了します。

IPアドレスとポートは機器ごとに異なり、表示例は対応を保証しません。診断機のWi-Fi接続中はインターネットが使えない場合があり、iPhoneではBluetoothやローカルネットワークへのアクセス許可が必要になることがあります。信頼できる機器とネットワークで使用してください。

現在のExpo/React Nativeの標準設定はAndroid SDK 36を対象とします。SDK 37以降を対象にする前に、Android 17のローカルネットワーク権限の要求と拒否時の動作を実装・検証してください。

上の開発コマンドでサンプルと通信処理を検証できます。ブラウザー版はサンプル専用です。実機接続には独自のネイティブ開発ビルドが必要で、Expo Goだけでは使えません。AndroidにはAndroid Studio/SDK、iOSのローカルビルドにはmacOSとXcodeが必要です。iPhoneへの配布にはAppleの署名も必要です。`app.json`の識別子は配布前に確認してください。

上記の追加コマンドでは、MITライセンスの独立した[elmulator](https://github.com/qadanm/elmulator)を使い、架空の診断機とTCP通信して読み取りや予想外の応答を検証できます。このテストはスマホの通信ライブラリや実車・実機の代わりにはなりません。

BLEの対応状況は機種ごとに異なります。上記の通信方式は実装上の対象であり、実機での動作保証ではありません。
