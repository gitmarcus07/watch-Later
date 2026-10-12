/**
 * Wires a real release signing config into `android/app/build.gradle`.
 *
 * Expo's generated template signs the `release` buildType with the Android
 * debug keystore, which is a well-known public key — anyone could sign an
 * "update" to a shipped app, and Play Console rejects it. This plugin adds a
 * `release` signing config and points the buildType at it.
 *
 * Credentials are resolved in priority order:
 *
 *   1. Environment variables (used by EAS Build via `eas secret`):
 *        EXPO_PUBLIC_MISSING... no — these are native-only and never inlined:
 *          ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD,
 *          ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
 *   2. `credentials/keystore.properties` (used by local builds), with keys:
 *        storeFile, storePassword, keyAlias, keyPassword
 *   3. Neither present -> the release buildType keeps debug signing and a
 *      warning is printed, so `expo prebuild` still succeeds for contributors
 *      who have no release key yet.
 *
 * The keystore lives in `credentials/` (outside the generated `android/` tree)
 * because `expo prebuild` regenerates that directory and would delete it.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SIGNING_CONFIG = `    release {
        storeFile file(RELEASE_STORE_FILE)
        storePassword RELEASE_STORE_PASSWORD
        keyAlias RELEASE_KEY_ALIAS
        keyPassword RELEASE_KEY_PASSWORD
    }`;

function readKeystoreProperties(projectRoot) {
  const propsFile = path.join(projectRoot, 'credentials', 'keystore.properties');
  if (!fs.existsSync(propsFile)) return null;

  const props = {};
  for (const line of fs.readFileSync(propsFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    props[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return props;
}

function resolveCredentials(projectRoot) {
  if (
    process.env.ANDROID_KEYSTORE_PATH &&
    process.env.ANDROID_KEYSTORE_PASSWORD &&
    process.env.ANDROID_KEY_ALIAS &&
    process.env.ANDROID_KEY_PASSWORD
  ) {
    return {
      storeFile: process.env.ANDROID_KEYSTORE_PATH,
      storePassword: process.env.ANDROID_KEYSTORE_PASSWORD,
      keyAlias: process.env.ANDROID_KEY_ALIAS,
      keyPassword: process.env.ANDROID_KEY_PASSWORD,
    };
  }

  const props = readKeystoreProperties(projectRoot);
  if (props && props.storeFile && props.storePassword && props.keyAlias && props.keyPassword) {
    return props;
  }
  return null;
}

function escapeForGroovy(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

module.exports = function withReleaseSigning(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appGradle = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'build.gradle',
      );

      let source = await fs.promises.readFile(appGradle, 'utf8');

      // Already wired (prebuild running over a previously configured tree).
      if (source.includes('RELEASE_STORE_FILE')) return config;

      const credentials = resolveCredentials(projectRoot);

      if (!credentials) {
        console.warn(
          '\n[withReleaseSigning] No release keystore credentials found.\n' +
            '  Set credentials/keystore.properties or the ANDROID_KEYSTORE_* env vars.\n' +
            '  The release buildType will keep debug signing, which Play Console rejects.\n',
        );
        return config;
      }

      // Allow the keystore to be addressed relative to the project root, so the
      // same properties file works on every machine and on EAS.
      const storeFilePath = path.isAbsolute(credentials.storeFile)
        ? credentials.storeFile
        : path.join(projectRoot, credentials.storeFile).replace(/\\/g, '/');

      const definitions = `ext {
    RELEASE_STORE_FILE = '${escapeForGroovy(storeFilePath)}'
    RELEASE_STORE_PASSWORD = '${escapeForGroovy(credentials.storePassword)}'
    RELEASE_KEY_ALIAS = '${escapeForGroovy(credentials.keyAlias)}'
    RELEASE_KEY_PASSWORD = '${escapeForGroovy(credentials.keyPassword)}'
}

android {`;

      if (!source.includes('android {')) {
        throw new Error(
          `[withReleaseSigning] Could not find the android { block in ${appGradle}.`,
        );
      }
      source = source.replace('android {', definitions);

      // Add the release signing config alongside the debug one.
      const signingConfigsIndex = source.indexOf('signingConfigs {');
      if (signingConfigsIndex === -1) {
        throw new Error(
          `[withReleaseSigning] Could not find signingConfigs { in ${appGradle}.`,
        );
      }
      const configsOpenBrace = source.indexOf('{', signingConfigsIndex);
      source =
        source.slice(0, configsOpenBrace + 1) +
        '\n' +
        SIGNING_CONFIG +
        source.slice(configsOpenBrace + 1);

      // Point the release buildType at it instead of the debug keystore.
      const releaseIndex = source.indexOf('release {', source.indexOf('buildTypes'));
      if (releaseIndex === -1) {
        throw new Error(
          `[withReleaseSigning] Could not find the release { buildType in ${appGradle}.`,
        );
      }
      const releaseBodyStart = source.indexOf('{', releaseIndex);
      const releaseBodyEnd = source.indexOf('}', releaseBodyStart);
      const releaseBody = source.slice(releaseBodyStart + 1, releaseBodyEnd);
      const patchedBody = releaseBody.replace(
        /signingConfig\s+signingConfigs\.debug/,
        'signingConfig signingConfigs.release',
      );
      source =
        source.slice(0, releaseBodyStart + 1) +
        patchedBody +
        source.slice(releaseBodyEnd);

      await fs.promises.writeFile(appGradle, source, 'utf8');

      // Keep the keystore and its password out of version control.
      const gitignorePath = path.join(projectRoot, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf8');
        const needed = [];
        if (!gitignore.includes('credentials/')) needed.push('credentials/');
        if (!gitignore.includes('*.jks')) needed.push('*.jks');
        if (needed.length) {
          fs.appendFileSync(
            gitignorePath,
            `\n# Release signing (never commit)\n${needed.join('\n')}\n`,
          );
        }
      }

      return config;
    },
  ]);
};
