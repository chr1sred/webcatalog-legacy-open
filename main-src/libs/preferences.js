/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const path = require('path');
const semver = require('semver');
const settings = require('electron-settings');
const { app, nativeTheme } = require('electron');
const fs = require('fs-extra');

const sendToAllWindows = require('./send-to-all-windows');
const isWindows10 = require('./is-windows-10');

// scope
const v = '2018';

const getDefaultInstallationPath = () => {
  if (process.platform === 'darwin') {
    return path.join('~', 'Applications', 'WebCatalog Apps');
  }
  if (process.platform === 'linux') {
    return '~/.webcatalog';
  }
  if (process.platform === 'win32') {
    return path.join(app.getPath('home'), 'WebCatalog Apps');
  }
  throw Error('Unsupported platform');
};

const defaultPreferences = {
  allowPrerelease: Boolean(semver.prerelease(app.getVersion())),
  alwaysOnTop: false, // for menubar
  attachToMenubar: false,
  createDesktopShortcut: true,
  createStartMenuShortcut: true,
  defaultHome: 'home',
  installationPath: getDefaultInstallationPath(),
  // all features are unlocked (kept for compatibility with generated apps)
  registered: true,
  requireAdmin: false,
  sortInstalledAppBy: 'last-updated',
  themeSource: 'system',
  trayIcon: false,
  useHardwareAcceleration: true,
  // use system title bar by default on Windows 8 & Windows 7
  // because on Windows 10, it's normally for apps not to have border
  // but on prior versions of Windows, apps have border
  // system title bar pref is required for the app have the native border
  useSystemTitleBar: process.platform === 'win32' && !isWindows10(),
};

let cachedPreferences = null;

const updateSharedPreferencesAsync = () => {
  if (cachedPreferences == null) return Promise.resolve();
  // shared-preferences.json includes:
  // shared-preferences.json is read by WebCatalog-Engine-based apps.
  // Telemetry and crash reporting do not exist in this fork: always disabled.
  const dotWebCatalogPath = path.join(app.getPath('home'), '.webcatalog');
  const sharedPreferencesPath = path.join(app.getPath('home'), '.webcatalog', 'shared-preferences.json');
  return fs.ensureDir(dotWebCatalogPath)
    .then(() => fs.writeJSON(sharedPreferencesPath, {
      telemetry: false,
      sentry: false,
    }));
};

const initCachedPreferences = () => {
  cachedPreferences = { ...defaultPreferences, ...settings.getSync(`preferences.${v}`) };

  // all features are always unlocked
  cachedPreferences.registered = true;
  delete cachedPreferences.licenseKey;

  // ensure shared preferences file exists
  updateSharedPreferencesAsync();
};

const getPreferences = () => {
  // trigger electron-settings before app ready might fail
  // so catch with default pref as fallback
  // https://github.com/nathanbuchar/electron-settings/issues/111
  try {
    // store in memory to boost performance
    if (cachedPreferences == null) {
      initCachedPreferences();
    }
    return cachedPreferences;
  } catch {
    return defaultPreferences;
  }
};

const setPreference = (name, value) => {
  sendToAllWindows('set-preference', name, value);
  cachedPreferences[name] = value;
  Promise.resolve().then(() => settings.setSync(`preferences.${v}.${name}`, value));

  if (name === 'themeSource') {
    nativeTheme.themeSource = value;
  }

};

const getPreference = (name) => {
  // trigger electron-settings before app ready might fail
  // so catch with default pref as fallback
  // https://github.com/nathanbuchar/electron-settings/issues/111
  try {
    // ensure compatiblity with old version
    if (process.platform === 'darwin' && (name === 'installationPath' || name === 'requireAdmin')) {
      // old pref, home or root
      if (settings.getSync('preferences.2018.installLocation') === 'root') {
        settings.unsetSync('preferences.2018.installLocation');

        setPreference('installationPath', '/Applications/WebCatalog Apps');
        setPreference('requireAdmin', true);

        if (name === 'installationPath') {
          return '/Applications/WebCatalog Apps';
        }
        return true;
      }
    }

    // store in memory to boost performance
    if (cachedPreferences == null) {
      initCachedPreferences();
    }
    return cachedPreferences[name];
  } catch {
    return defaultPreferences[name];
  }
};

const resetPreferences = () => {
  cachedPreferences = null;
  settings.unsetSync();

  const preferences = getPreferences();
  sendToAllWindows('set-preferences', preferences);
};

module.exports = {
  getPreference,
  getPreferences,
  resetPreferences,
  setPreference,
};
