/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Where the app looks for the engine ("Neutron") that powers generated apps.
// Both locations can be overridden with environment variables, so a mirror
// can be used without rebuilding the app:
//   WEBCATALOG_OPEN_ENGINE_VERSIONS_URL  -> folder serving stable.json & beta.json
//   WEBCATALOG_OPEN_ENGINE_RELEASES_URL  -> folder serving <tag>/template-<platform>-<arch>.json
const DEFAULT_VERSIONS_URL = 'https://cdn-1.webcatalog.io/neutron/versions';
const DEFAULT_RELEASES_URL = 'https://github.com/webcatalog/webcatalog-engine/releases/download';

const clean = (url) => url.replace(/\/+$/, '');

const getVersionsBaseUrl = () => clean(process.env.WEBCATALOG_OPEN_ENGINE_VERSIONS_URL || DEFAULT_VERSIONS_URL);
const getReleasesBaseUrl = () => clean(process.env.WEBCATALOG_OPEN_ENGINE_RELEASES_URL || DEFAULT_RELEASES_URL);

module.exports = { getVersionsBaseUrl, getReleasesBaseUrl };
