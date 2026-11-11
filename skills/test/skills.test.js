// SPDX-License-Identifier: AGPL-3.0-or-later
// The skills (issue #29): each SKILL.md follows the Agent Skills format
// (agentskills.io), talks only to our own hosts, carries no key, and the
// plugin and marketplace manifests point at it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url);
const skillsDir = new URL('../', import.meta.url);

/** The hosts a skill may name: the API with its web UI, the source, and the format's own site. */
const OUR_HOSTS = new Set(['eigenbeleg.le-space.de', 'le-space.de', 'github.com', 'agentskills.io']);

/** @param {string} text */
function frontmatter(text) {
	const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
	assert.ok(m, 'SKILL.md starts with YAML frontmatter');
	/** @type {Record<string, string>} */
	const fields = {};
	for (const line of m[1].split('\n')) {
		const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
		if (kv) fields[kv[1]] = kv[2].trim();
	}
	return { fields, body: m[2] };
}

const skills = (await readdir(skillsDir, { withFileTypes: true })).filter((d) => d.isDirectory() && d.name !== 'test').map((d) => d.name);

test('there is at least one skill, and each is a directory with a SKILL.md', async () => {
	assert.ok(skills.includes('eigenbeleg-api'));
	for (const name of skills) assert.ok((await stat(new URL(`${name}/SKILL.md`, skillsDir))).isFile(), `${name}/SKILL.md`);
});

for (const name of skills) {
	test(`${name}: the frontmatter follows the Agent Skills specification`, async () => {
		const { fields, body } = frontmatter(await readFile(new URL(`${name}/SKILL.md`, skillsDir), 'utf8'));
		assert.equal(fields.name, name, 'name matches the directory');
		assert.match(fields.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase, digits and single hyphens');
		assert.ok(fields.name.length <= 64);
		assert.ok(fields.description.length > 0 && fields.description.length <= 1024, 'description 1–1024 characters');
		if (fields.compatibility) assert.ok(fields.compatibility.length <= 500);
		assert.ok(body.split('\n').length <= 500, 'the body stays under 500 lines');
		assert.match(body, /^# /m, 'the body has a title');
	});

	test(`${name}: names only our hosts and carries no key or address of a real person`, async () => {
		const text = await readFile(new URL(`${name}/SKILL.md`, skillsDir), 'utf8');
		for (const [, host] of text.matchAll(/https?:\/\/([^/\s)"'`>]+)/g)) assert.ok(OUR_HOSTS.has(host), `host ${host} is not ours`);
		assert.doesNotMatch(text, /ed25519:[1-9A-HJ-NP-Za-km-z]{40,}/, 'a NEAR key');
		assert.doesNotMatch(text, /0x[0-9a-fA-F]{64}/, 'an EVM key');
		assert.doesNotMatch(text, /\baat_[A-Za-z0-9]/, 'a market token');
		assert.doesNotMatch(text, /[\w.-]+@[\w-]+(\.[\w-]+)*\.(de|com|org|net)\b/, 'a mail address');
		// Examples use the made-up payer only.
		if (/"name":/.test(text)) assert.match(text, /Wolkenfabrik Hosting GmbH/);
	});
}

test('the plugin manifest and the marketplace point at the skills', async () => {
	const plugin = JSON.parse(await readFile(new URL('.claude-plugin/plugin.json', root), 'utf8'));
	assert.equal(plugin.name, 'eigenbeleg');
	assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
	const market = JSON.parse(await readFile(new URL('.claude-plugin/marketplace.json', root), 'utf8'));
	assert.equal(market.name, 'le-space');
	assert.ok(market.owner?.name);
	assert.ok(Array.isArray(market.plugins) && market.plugins.length >= 1);
	for (const p of market.plugins) {
		assert.match(p.name, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
		assert.match(p.source, /^\.\//, 'a relative source inside this repository');
		// The plugin's directory holds the skills directory.
		const dir = join(root.pathname, p.source);
		assert.ok((await stat(join(dir, 'skills'))).isDirectory(), `${p.source} has skills/`);
	}
});
