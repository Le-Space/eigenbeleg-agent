// SPDX-License-Identifier: AGPL-3.0-or-later
// The skills (issue #29): each SKILL.md follows the Agent Skills format
// (agentskills.io), talks only to our own hosts, carries no key, and the
// plugin and marketplace manifests point at it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { dataSources } from '@eigenbeleg/pipeline';

/** The repository, the plugin folder (what `claude plugin install` copies) and its skills. */
const root = new URL('../../', import.meta.url);
const pluginDir = new URL('../', import.meta.url);
const skillsDir = new URL('skills/', pluginDir);

/**
 * The hosts a skill may name: the API with its web UI, the source, the format's own site, and the
 * data sources the pipeline asks (the same list the web UI's privacy note is checked against).
 */
const OUR_HOSTS = new Set(['eigenbeleg.le-space.de', 'le-space.de', 'github.com', 'agentskills.io', ...dataSources().map((s) => new URL(s.origin).host)]);

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
	assert.ok(skills.includes('eigenbeleg-api') && skills.includes('eigenbeleg-local'));
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
		assert.match(fields.license ?? '', /^CC-BY-4\.0\b/, 'the text is CC-BY-4.0 (plugin/LICENSE.md); the scripts stay AGPL');
		assert.ok(body.split('\n').length <= 500, 'the body stays under 500 lines');
		assert.match(body, /^# /m, 'the body has a title');
	});

	test(`${name}: names only our hosts and carries no key or address of a real person`, async () => {
		const text = await readFile(new URL(`${name}/SKILL.md`, skillsDir), 'utf8');
		for (const [, host] of text.matchAll(/https?:\/\/([^/\s)"'`>]+)/g)) assert.ok(OUR_HOSTS.has(host), `host ${host} is not ours`);
		assert.doesNotMatch(text, /ed25519:[1-9A-HJ-NP-Za-km-z]{40,}/, 'a NEAR key');
		assert.doesNotMatch(text, /0x[0-9a-fA-F]{64}/, 'an EVM key');
		assert.doesNotMatch(text, /\baat_[A-Za-z0-9]/, 'a market token');
		// Our own addresses (where to report a discrepancy) only.
		assert.deepEqual([...text.matchAll(/[\w.-]+@[\w-]+(\.[\w-]+)*\.(de|com|org|net)\b/g)].map((m) => m[0]).filter((a) => !a.endsWith('@le-space.de')), [], 'a mail address');
		// Examples use the made-up payer only.
		if (/"name":/.test(text)) assert.match(text, /Wolkenfabrik Hosting GmbH/);
	});
}

test('the plugin manifest and the marketplace point at the skills', async () => {
	const plugin = JSON.parse(await readFile(new URL('.claude-plugin/plugin.json', pluginDir), 'utf8'));
	assert.equal(plugin.name, 'eigenbeleg');
	assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
	assert.equal(plugin.license, 'CC-BY-4.0', 'the plugin folder holds the skill texts only');
	// What the directory asks of the plugin folder (claude.com/docs/plugins/pre-submission-checklist): a
	// README of 40 words or more, a licence, and no package.json beside a lockfile (that would make
	// `claude plugin install` run npm for the whole workspace).
	const readme = await readFile(new URL('README.md', pluginDir), 'utf8');
	assert.ok(readme.replace(/```[\s\S]*?```/g, '').split(/\s+/).length >= 40);
	await stat(new URL('LICENSE.md', pluginDir));
	for (const f of ['package.json', 'package-lock.json', '.npmrc']) await assert.rejects(stat(new URL(f, pluginDir)), `${f} is not in the plugin folder`);
	const market = JSON.parse(await readFile(new URL('.claude-plugin/marketplace.json', root), 'utf8'));
	assert.equal(market.name, 'le-space');
	assert.ok(market.owner?.name);
	assert.ok(Array.isArray(market.plugins) && market.plugins.length >= 1);
	for (const p of market.plugins) {
		assert.match(p.name, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
		assert.match(p.source, /^\.\/plugin$/, 'the plugin folder, not the repository (its lockfile would be installed)');
		const dir = join(root.pathname, p.source);
		assert.ok((await stat(join(dir, 'skills'))).isDirectory(), `${p.source} has skills/`);
		assert.ok((await stat(join(dir, '.claude-plugin/plugin.json'))).isFile());
	}
});

test('every skill tells the person, with each delivery, that the service is in a test phase: check the documents, report discrepancies', async () => {
	for (const name of skills) {
		const text = await readFile(new URL(`${name}/SKILL.md`, skillsDir), 'utf8');
		assert.match(text, /\*\*test phase\*\*/, name);
		assert.match(text, /report any discrepancy at once, with the\s+transaction\s+hash, to eigenbeleg@le-space\.de/, name);
		assert.match(text, /Never present the documents as\s+checked/, name);
	}
});
