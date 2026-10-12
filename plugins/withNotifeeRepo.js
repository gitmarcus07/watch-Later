/**
 * Registers Notifee's bundled Maven repository on the root project.
 *
 * `@notifee/react-native` resolves `app.notifee:core` from an AAR it ships
 * inside its own package (`node_modules/@notifee/react-native/android/libs`).
 * That artifact is not published to Google's Maven, Maven Central, or JitPack,
 * so Gradle fails with:
 *
 *   Could not find any matches for app.notifee:core:+
 *
 * Notifee adds the repo from its own build.gradle via `rootProject.allprojects`,
 * but that injection does not reliably reach `:app`'s resolution under
 * Gradle 9 + configuration-on-demand, which is how the repo's local build broke.
 * Adding it here, on the root project's `allprojects`, makes it unconditional.
 *
 * This runs during `expo prebuild`, so the repo is re-applied to the generated
 * `android/` tree for both EAS cloud builds and local `expo run:android`.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const REPO_MARKER = '@notifee/react-native/android/libs';

module.exports = function withNotifeeRepo(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const buildGradle = path.join(
        config.modRequest.platformProjectRoot,
        'build.gradle',
      );

      let source = await fs.promises.readFile(buildGradle, 'utf8');

      // Idempotent: prebuild may run repeatedly over an existing android/ tree.
      if (source.includes(REPO_MARKER)) return config;

      // Anchor on the root project's repository block. Expo's template always
      // emits `allprojects { repositories { google() ... } }`; fall back to the
      // first `repositories {` if the template ever changes shape.
      const allProjectsIndex = source.indexOf('allprojects');
      if (allProjectsIndex === -1) {
        throw new Error(
          `[withNotifeeRepo] Could not find an allprojects block in ${buildGradle}.`,
        );
      }

      const repositoriesIndex = source.indexOf('repositories', allProjectsIndex);
      const openBraceIndex = source.indexOf('{', repositoriesIndex);
      if (repositoriesIndex === -1 || openBraceIndex === -1) {
        throw new Error(
          `[withNotifeeRepo] Could not find the repositories block inside allprojects in ${buildGradle}.`,
        );
      }

      const injection = [
        '',
        '    // @notifee/react-native ships app.notifee:core as a local AAR; it is not',
        '    // published to any public repository. Added by plugins/withNotifeeRepo.js.',
        `    maven { url "$rootDir/../node_modules/${REPO_MARKER}" }`,
      ].join('\n');

      source =
        source.slice(0, openBraceIndex + 1) +
        injection +
        source.slice(openBraceIndex + 1);

      await fs.promises.writeFile(buildGradle, source, 'utf8');
      return config;
    },
  ]);
};
