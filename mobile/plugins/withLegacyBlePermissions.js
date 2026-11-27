const { withAndroidManifest } = require('@expo/config-plugins');

// BLE scans need location permission on Android <= 11. The app never derives
// location from scans, so cap the library's legacy declarations at API 30.
module.exports = function withLegacyBlePermissions(config) {
  return withAndroidManifest(config, manifest => {
    const permissions = manifest.modResults.manifest['uses-permission'] ??= [];
    for (const name of [
      'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_ADMIN',
    ]) {
      const existing = permissions.find(item => item.$['android:name'] === name);
      if (existing) existing.$['android:maxSdkVersion'] = '30';
      else permissions.push({ $: { 'android:name': name, 'android:maxSdkVersion': '30' } });
    }
    return manifest;
  });
};
