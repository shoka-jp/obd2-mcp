"""Check Bluetooth privacy declarations in generated and merged native files."""

import plistlib
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def check_android(path: Path) -> None:
    root = ET.parse(path).getroot()
    android = "{http://schemas.android.com/apk/res/android}"
    permissions = [entry for entry in root if entry.tag in {"uses-permission", "uses-permission-sdk-23"}]
    legacy = {
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
    }
    names = {entry.get(android + "name") for entry in permissions}
    if not legacy.issubset(names):
        raise ValueError("Missing legacy Bluetooth or location permission")
    for entry in permissions:
        if entry.get(android + "name") in legacy and entry.get(android + "maxSdkVersion") != "30":
            raise ValueError(f"Legacy permission must be limited to Android 11: {entry.attrib}")
    scans = [entry for entry in permissions if entry.get(android + "name") == "android.permission.BLUETOOTH_SCAN"]
    if not scans or any("neverForLocation" not in entry.get(android + "usesPermissionFlags", "") for entry in scans):
        raise ValueError("Bluetooth scan permission must declare neverForLocation")
    if "android.permission.BLUETOOTH_CONNECT" not in names:
        raise ValueError("Missing Bluetooth connect permission")


def check_ios(path: Path) -> None:
    with path.open("rb") as file:
        info = plistlib.load(file)
    for key in ("NSBluetoothAlwaysUsageDescription", "NSLocalNetworkUsageDescription"):
        if not isinstance(info.get(key), str) or not info[key].strip():
            raise ValueError(f"Missing iOS permission explanation: {key}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in {"android", "ios"}:
        raise SystemExit("Usage: check_native_config.py android|ios path")
    (check_android if sys.argv[1] == "android" else check_ios)(Path(sys.argv[2]))
    print(f"{sys.argv[1]} permission configuration verified")
