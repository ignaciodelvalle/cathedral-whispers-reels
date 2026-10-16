// Worker run by GitHub Actions: fetch Reel jobs, render each one, upload, report back.
// Auth is GitHub's OIDC token (no stored secrets); the API checks it is this repo on main.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderReel } from './render.mjs';

const API = process.env.REELS_API ?? 'https://inxplljsxarnrhxpmqks.supabase.co/functions/v1/reels-api';

async function oidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const tok = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !tok) throw new Error('No OIDC token available (needs permissions: id-token: write)');
  const r = await fetch(`${url}&audience=cathedral-whispers`, { headers: { Authorization: `bearer ${tok}` } });
  if (!r.ok) throw new Error(`OIDC request failed: ${r.status}`);
  return (await r.json()).value;
}

async function api(route, body = {}) {
  const r = await fetch(`${API}/${route}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await oidcToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${route}: ${r.status} ${out.error ?? ''}`);
  return out;
}

function contactSheet(video, duration, file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'));
  const marks = [0.01, 0.12, 0.3, 0.5, 0.72, 0.97].map((f) => Math.max(0, duration * f));
  marks.forEach((t, i) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=270:480', path.join(dir, `f${i}.png`)]));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, 'f%d.png'), '-vf', 'tile=6x1:padding=6:color=white', '-frames:v', '1', '-q:v', '4', file]);
  fs.rmSync(dir, { recursive: true, force: true });
  return file;
}

const { jobs } = await api('jobs');
console.log(`${jobs.length} job(s)`);
let failures = 0;
for (const job of jobs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-'));
  const out = path.join(dir, `${job.id}.mp4`);
  const poster = path.join(dir, 'poster.jpg');
  try {
    console.log(`rendering ${job.label} (${job.id})`);
    const res = await renderReel(job, out, { poster });
    const size = fs.statSync(out).size;
    console.log(`  ${res.duration}s, ${(size / 1e6).toFixed(1)} MB, ${res.pages} page(s) at ${res.size}px`);
    const up = await api('upload-url', { id: job.id });
    const put = await fetch(up.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'true', ...(up.apikey ? { apikey: up.apikey } : {}) },
      body: fs.readFileSync(out),
    });
    if (!put.ok) throw new Error(`upload failed: ${put.status} ${await put.text()}`);
    const done = { id: job.id, path: up.path, duration: res.duration, poster_b64: fs.readFileSync(poster).toString('base64') };
    if (job.test) done.sheet_b64 = fs.readFileSync(contactSheet(out, res.duration, path.join(dir, 'sheet.jpg'))).toString('base64');
    await api('done', done);
    console.log('  uploaded');
  } catch (e) {
    failures++;
    console.error(`  failed: ${e.message}`);
    await api('fail', { id: job.id, error: e.message }).catch(() => {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
if (failures) process.exitCode = 1;
