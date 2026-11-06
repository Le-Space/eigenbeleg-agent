// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The narrator, as in the Belege videos: ElevenLabs, model eleven_v4; in
// English "George" (calm, British), in German "Marc" (native, calm). Each line is spoken once and kept under its hash
// in out/video/voice/, so a re-recording neither pays nor waits twice.
//
// The key is read from the macOS keychain (service "elevenlabs") or
// ELEVENLABS_API_KEY and is never printed. Without one, or with
// DEMO_VOICE=say, macOS `say` speaks instead.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '../../out/video/voice');
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v4';
/** Narrators by language: George (as in the Belege videos) and Marc, a native German voice from the ElevenLabs library. */
export const VOICES = { en: 'JBFqnCBsd6RMkjVDRZzb', de: 'HzBCRGsOskP44taMg2CT' };
const IPA_MODEL = /^eleven_v[34]/.test(MODEL);

/** German words an English voice should say the German way: IPA between slashes (v3/v4 models). */
const PRONOUNCE = {
	Eigenbelege: '/ˈaɪ̯ɡn̩bəˌleːɡə/',
	Eigenbeleg: '/ˈaɪ̯ɡn̩bəˌleːk/'
};
const spoken = (text, lang) =>
	IPA_MODEL && lang === 'en' ? text.replace(new RegExp(`\\b(${Object.keys(PRONOUNCE).join('|')})\\b`, 'g'), (w) => PRONOUNCE[w]) : text;

function apiKey() {
	if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
	try {
		return execFileSync('security', ['find-generic-password', '-s', 'elevenlabs', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return '';
	}
}

/** 'elevenlabs' or 'say'. */
export function provider() {
	if (process.env.DEMO_VOICE === 'say') return 'say';
	return apiKey() ? 'elevenlabs' : 'say';
}

/** @param {string} file */
export function durationMs(file) {
	return Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()) * 1000);
}

/**
 * The spoken file for a line, made if missing.
 *
 * @param {string} text
 * @param {{ lang?: 'en' | 'de', sayVoice?: string, sayRate?: string }} [o]
 * @returns {Promise<{ file: string, durationMs: number, provider: string }>}
 */
export async function speak(text, { lang = 'en', sayVoice = lang === 'de' ? 'Anna' : 'Samantha', sayRate = '172' } = {}) {
	const kind = provider();
	const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || VOICES[lang];
	mkdirSync(DIR, { recursive: true });
	const hash = createHash('sha256')
		.update(kind === 'elevenlabs' ? `elevenlabs:${MODEL}:${VOICE_ID}:${spoken(text, lang)}` : `say:${sayVoice}:${sayRate}:${text}`)
		.digest('hex')
		.slice(0, 20);
	const file = resolve(DIR, `${hash}.mp3`);
	if (!existsSync(file)) {
		if (kind === 'say') {
			const aiff = resolve(DIR, `${hash}.aiff`);
			execFileSync('say', ['-v', sayVoice, '-r', sayRate, '-o', aiff, text]);
			execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', aiff, '-codec:a', 'libmp3lame', '-q:a', '3', file]);
		} else {
			const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
				method: 'POST',
				headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json', accept: 'audio/mpeg' },
				body: JSON.stringify({ text: spoken(text, lang), model_id: MODEL, language_code: lang })
			});
			if (!res.ok) throw new Error(`ElevenLabs: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
			writeFileSync(file, Buffer.from(await res.arrayBuffer()));
		}
	}
	return { file, durationMs: durationMs(file), provider: kind };
}
