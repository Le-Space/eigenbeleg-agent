// SPDX-License-Identifier: AGPL-3.0-or-later
// Which build this API is, for GET /, /health, /openapi.json and /llms.txt:
// the version of apps/api, and the commit it was built from with that
// commit's instant – never the build clock. The page's footer names the same
// (apps/web/build-info.js); page and API are one image, so they agree.
//
// In the container there is no .git: the image workflow hands the commit in
// as SOURCE_COMMIT and SOURCE_COMMIT_DATE (Dockerfile). In a checkout they
// come from git. Without either, the commit is left out, never guessed.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** @typedef {{ version: string, commit: string, date: string }} Build '' for what is not known */

/**
 * @param {{ version?: string, commit?: string, date?: string }} raw as found
 * @returns {Build} checked: `1.2.3`, a lowercase hex commit, an ISO instant; else ''
 */
export function checkedBuild({ version = '', commit = '', date = '' } = {}) {
	const v = String(version).trim();
	const sha = String(commit).trim().toLowerCase();
	const when = new Date(String(date).trim());
	const ok = /^[0-9a-f]{7,40}$/.test(sha) && !Number.isNaN(when.getTime());
	return { version: /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(v) ? v : '', commit: ok ? sha : '', date: ok ? when.toISOString() : '' };
}

/** @param {Record<string, string | undefined>} [env] */
export function apiBuild(env = process.env) {
	let version = '';
	try {
		version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
	} catch {
		// no manifest: no version
	}
	let commit = env.SOURCE_COMMIT ?? '';
	let date = env.SOURCE_COMMIT_DATE ?? '';
	if (!commit) {
		try {
			[commit = '', date = ''] = execFileSync('git', ['log', '-1', '--format=%H%n%cI'], { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
				.trim()
				.split('\n');
		} catch {
			// no git here: no commit
		}
	}
	return checkedBuild({ version, commit, date });
}

/**
 * The build as an answer names it: only what is known.
 * @param {Build} b
 * @returns {{ version?: string, commit?: string, built?: string }}
 */
export const buildFields = (b) => ({ ...(b.version ? { version: b.version } : {}), ...(b.commit ? { commit: b.commit, built: b.date } : {}) });
