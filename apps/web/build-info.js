// SPDX-License-Identifier: AGPL-3.0-or-later
// What the footer names about this build (as Belege's does): the version of
// apps/web, and the commit the page is built from with that commit's instant,
// never the build clock, so a rebuild of one commit gives the same bytes. From
// git where there is a checkout (the last commit that touched the web UI or
// what it is built with); in the container build, which copies no .git, from
// SOURCE_COMMIT and SOURCE_COMMIT_DATE, which the image workflow hands in.
// Without either, empty strings: the footer then leaves the stamp out.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @param {{ commit?: string, date?: string, version?: string }} raw as found
 * @returns {{ release: string, commit: string, date: string }} checked: a full or short lowercase commit, an ISO instant, `v1.2.3`; else ''
 */
export function buildStamp({ commit = '', date = '', version = '' } = {}) {
	const sha = String(commit).trim().toLowerCase();
	const when = String(date).trim();
	const ok = /^[0-9a-f]{7,40}$/.test(sha) && !Number.isNaN(new Date(when).getTime());
	const v = String(version).trim();
	return { release: /^\d+\.\d+\.\d+/.test(v) ? `v${v}` : '', commit: ok ? sha : '', date: ok ? new Date(when).toISOString() : '' };
}

/** @param {Record<string, string | undefined>} env */
export function buildInfo(env = process.env) {
	const cwd = fileURLToPath(new URL('.', import.meta.url));
	let version = '';
	try {
		version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
	} catch {
		// no manifest: no version
	}
	let commit = env.SOURCE_COMMIT ?? '';
	let date = env.SOURCE_COMMIT_DATE ?? '';
	if (!commit) {
		try {
			[commit = '', date = ''] = execFileSync('git', ['log', '-1', '--format=%H%n%cI', '--', '.', '../../packages', '../../package.json', '../../package-lock.json'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
				.trim()
				.split('\n');
		} catch {
			// no git here (the container build without SOURCE_COMMIT): no stamp
		}
	}
	return buildStamp({ commit, date, version });
}
