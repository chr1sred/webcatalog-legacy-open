/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const path = require('path');
const fs = require('fs-extra');
const semver = require('semver');
const NodeCache = require('node-cache');
const { fork } = require('child_process');
const { app } = require('electron');
const envPaths = require('env-paths').default;

const customizedFetch = require('../../customized-fetch');
const sendToAllWindows = require('../../send-to-all-windows');
const { getPreference } = require('../../preferences');
const { getVersionsBaseUrl, getReleasesBaseUrl } = require('../../engine-config');

// force re-extract for first installation after launch
global.forceExtract = true;

const cache = new NodeCache();

const FETCH_TIMEOUT_MS = 10000;

const getCacheRoot = () => envPaths('webcatalog', { suffix: '' }).cache;

// last versions successfully fetched, so the app keeps working if the
// version server is unreachable (offline, server down, mirror moved...)
const getEngineStatePath = () => path.join(app.getPath('userData'), 'engine-state.json');

const readEngineState = () => {
  try {
    return fs.readJsonSync(getEngineStatePath());
  } catch (err) {
    return {};
  }
};

const writeEngineState = (state) => {
  try {
    fs.writeJsonSync(getEngineStatePath(), state);
  } catch (err) {
    console.log(err); // eslint-disable-line no-console
  }
};

const fetchChannelVersionAsync = (channel) => customizedFetch(
  `${getVersionsBaseUrl()}/${channel}.json`,
  { timeout: FETCH_TIMEOUT_MS },
)
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then((data) => {
    if (!data || !semver.valid(data.version)) throw new Error('Invalid engine version response.');
    return data.version;
  });

// version of the engine already stored on this machine (see prepare-engine-forked.js)
const getLocalEngineVersion = () => {
  try {
    return fs.readJsonSync(path.join(getCacheRoot(), 'webcatalog-engine', 'template-info.json')).version;
  } catch (err) {
    return null;
  }
};

const getTagNameAsync = () => {
  const allowPrerelease = getPreference('allowPrerelease');
  const stateKey = allowPrerelease ? 'prerelease' : 'stable';

  // when prerelease is allowed, check both channels and return the newer version
  const channels = allowPrerelease ? ['stable', 'beta'] : ['stable'];
  return Promise.all(channels.map(fetchChannelVersionAsync))
    .then((versions) => versions.reduce((a, b) => (semver.gt(a, b) ? a : b)))
    .then((version) => {
      writeEngineState({ ...readEngineState(), [stateKey]: version });
      return `v${version}`;
    })
    .catch((err) => {
      console.log(err); // eslint-disable-line no-console
      const fallbackVersion = readEngineState()[stateKey] || getLocalEngineVersion();
      // 'local' tells the forked script to use only what is stored on this machine
      return fallbackVersion ? `v${fallbackVersion}` : 'local';
    });
};

const downloadExtractTemplateAsync = (tagName) => new Promise((resolve, reject) => {
  const cacheRoot = getCacheRoot();

  let latestTemplateVersion = '0.0.0';
  const scriptPath = path.join(__dirname, 'prepare-engine-forked.js')
    .replace('app.asar', 'app.asar.unpacked');

  const args = [
    '--appVersion',
    app.getVersion(),
    '--userDataPath',
    app.getPath('userData'),
    '--cacheRoot',
    cacheRoot,
    '--platform',
    process.platform,
    '--arch',
    process.arch,
    '--tagName',
    tagName,
    '--releasesBaseUrl',
    getReleasesBaseUrl(),
  ];

  const cachedTemplateInfoJson = cache.get(`templateInfoJson.${tagName}`);
  if (cachedTemplateInfoJson) {
    args.push('--templateInfoJson');
    args.push(cachedTemplateInfoJson);
  }


  const child = fork(scriptPath, args, {
    env: {
      ELECTRON_RUN_AS_NODE: 'true',
      ELECTRON_NO_ASAR: 'true',
      APPDATA: app.getPath('appData'),
      FORCE_EXTRACT: Boolean(global.forceExtract).toString(),
    },
  });

  let err = null;
  child.on('message', (message) => {
    if (message && message.templateInfo) {
      latestTemplateVersion = message.templateInfo.version;
      // cache template info for the tag name indefinitely (until app is quitted)
      cache.set(`templateInfoJson.${tagName}`, JSON.stringify(message.templateInfo));
    } else if (message && message.progress) {
      sendToAllWindows('update-installation-progress', message.progress);
    } else if (message && message.error) {
      err = new Error(message.error.message);
      err.stack = message.error.stack;
      err.name = message.error.name;
    } else {
      console.log(message); // eslint-disable-line no-console
    }
  });

  child.on('exit', (code) => {
    if (code === 1) {
      reject(err || new Error('Forked script failed to run correctly.'));
      return;
    }

    // // extracting template code successful so need to re-extract next time
    global.forceExtract = false;

    resolve(latestTemplateVersion);
  });
});

const prepareEngineAsync = () => getTagNameAsync()
  .then((tagName) => downloadExtractTemplateAsync(tagName));

module.exports = prepareEngineAsync;
