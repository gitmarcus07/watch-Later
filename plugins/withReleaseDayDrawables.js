/**
 * Copies the Release Day notification drawables + sound into the Android
 * `res/` tree during `expo prebuild`, so both EAS cloud builds and local
 * `expo run:android` builds carry them:
 *
 * - drawable-mdpi…xxxhdpi/ic_stat_watch_later.png (small-icon silhouette)
 * - drawable-nodpi/ic_large_watch_later.png (full-color large icon)
 * - raw/wl_now_showing.wav (channel sound; the expo-notifications plugin
 *   copies the same file — overwriting it here is harmless and keeps this
 *   plugin self-sufficient)
 *
 * Sources live in `assets/notification-android/` (+ `assets/wl_now_showing.wav`).
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RES_DIRS = [
  'drawable-mdpi',
  'drawable-hdpi',
  'drawable-xhdpi',
  'drawable-xxhdpi',
  'drawable-xxxhdpi',
  'drawable-nodpi',
];

module.exports = function withReleaseDayDrawables(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resRoot = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
      );

      const rawDir = path.join(resRoot, 'raw');
      await fs.promises.mkdir(rawDir, { recursive: true });
      await fs.promises.copyFile(
        path.join(projectRoot, 'assets', 'wl_now_showing.wav'),
        path.join(rawDir, 'wl_now_showing.wav'),
      );

      const srcRoot = path.join(projectRoot, 'assets', 'notification-android');
      for (const dir of RES_DIRS) {
        const src = path.join(srcRoot, dir);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(resRoot, dir);
        await fs.promises.mkdir(dest, { recursive: true });
        for (const file of await fs.promises.readdir(src)) {
          await fs.promises.copyFile(path.join(src, file), path.join(dest, file));
        }
      }
      return config;
    },
  ]);
};
