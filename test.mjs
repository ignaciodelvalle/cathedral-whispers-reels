// Local test: renders one sample of every format from synthetic images (no network).
//   node test.mjs [outdir] [format...]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { renderReel } from './render.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.resolve(process.argv[2] ?? 'test-out');
const only = process.argv.slice(3);
const fx = path.join(outDir, 'fixtures');
fs.mkdirSync(fx, { recursive: true });
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);

// a warm interior-ish photo and a cool landscape one
const photo = path.join(fx, 'photo.jpg'), wide = path.join(fx, 'wide.jpg');
ff('-f', 'lavfi', '-i', 'gradients=s=1600x2400:c0=0x3a2614:c1=0xc9a46a:c2=0x6e4a2a:c3=0xe8d2a4:nb_colors=4:x0=0:y0=0:x1=1600:y1=2400:speed=0.00001',
  '-vf', 'noise=alls=12:allf=t,drawbox=x=500:y=300:w=600:h=1400:color=0xf3e3c0@0.35:t=fill,drawbox=x=620:y=420:w=360:h=1160:color=0x2a1a0c@0.4:t=fill', '-frames:v', '1', photo);
ff('-f', 'lavfi', '-i', 'gradients=s=2400x1600:c0=0x1f2a38:c1=0x8aa0b8:c2=0x334455:c3=0xc8d4e0:nb_colors=4:speed=0.00001', '-vf', 'noise=alls=10:allf=t', '-frames:v', '1', wide);

// fake rendered photo posts (1080x1350) for the teaser and the week slides
const font = (f) => fs.readFileSync(path.join(HERE, 'fonts', f));
const FONTS = [{ name: 'EB Garamond', weight: 500, style: 'normal', data: font('eb-garamond-latin-500-normal.woff') },
  { name: 'Cinzel', weight: 500, style: 'normal', data: font('cinzel-latin-500-normal.woff') }];
async function fakePost(i, label, text, colors) {
  const bg = path.join(fx, `post-bg-${i}.jpg`), fg = path.join(fx, `post-fg-${i}.png`), file = path.join(fx, `post-${i}.png`);
  ff('-f', 'lavfi', '-i', `gradients=s=1080x1350:c0=${colors[0]}:c1=${colors[1]}:speed=0.00001`, '-vf', 'noise=alls=8:allf=t', '-frames:v', '1', bg);
  const svg = await satori({ type: 'div', props: { style: { width: 1080, height: 1350, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 110, backgroundColor: 'rgba(0,0,0,0.35)' }, children: [
    { type: 'div', props: { style: { fontFamily: 'Cinzel', fontSize: 40, letterSpacing: 6, color: '#e7cc8f', marginBottom: 40 }, children: label.toUpperCase() } },
    { type: 'div', props: { style: { fontFamily: 'EB Garamond', fontSize: 64, lineHeight: 1.3, color: '#fbf6ec', textAlign: 'center' }, children: text } }] } }, { width: 1080, height: 1350, fonts: FONTS });
  fs.writeFileSync(fg, new Resvg(svg).render().asPng());
  ff('-i', bg, '-i', fg, '-filter_complex', 'overlay', file);
  return file;
}
const posts = [
  ['Psalms', 'Be still, and know that I am God.', ['0x2b1d10', '0xa8824e']],
  ['Seneca', 'While we are postponing, life speeds by.', ['0x1c2430', '0x6f8297']],
  ['Dhammapada', 'Better than a thousand hollow words is one word that brings peace.', ['0x2a2a1a', '0x9a9a62']],
  ['Isaiah', 'They that wait upon the Lord shall renew their strength.', ['0x301a14', '0xb06a4a']],
  ['Tao Te Ching', 'The softest things in the world overcome the hardest.', ['0x16282a', '0x5e9a98']],
  ['Pirkei Avot', 'Who is wise? One who learns from every person.', ['0x2a1e2e', '0x8a6a96']],
  ['Rumi', 'Let the beauty we love be what we do.', ['0x2e1c0e', '0xc08a3a']],
];
const files = [];
for (let i = 0; i < posts.length; i++) files.push(await fakePost(i, ...posts[i]));
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const teaser = { image_url: files[0], first_line: 'Be still, and know that I am God.', when: 'Tomorrow, 7:30 AM' };

const base = { brand: 'Cathedral Whispers', subject: 'nave' };
const jobs = {
  passage: { ...base, label: 'Psalm 23', cite: 'Psalm 23:1–4 · King James Version (1611)', audio: 'vespers',
    place: 'Wells Cathedral, Somerset · begun c. 1175', dim: true, teaser,
    segments: ['The Lord is my shepherd; I shall not want.', 'He maketh me to lie down in green pastures:', 'he leadeth me beside the still waters.', 'He restoreth my soul.'] },
  oneline: { ...base, format: 'oneline', label: 'Psalms', cite: 'Psalm 46:10 · King James Version (1611)', audio: 'dawn',
    segments: ['Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.'] },
  breath: { ...base, format: 'breath', label: 'Matthew', cite: 'Matthew 11:28 · King James Version (1611)',
    segments: ['Come unto me, all ye that labour and are heavy laden, and I will give you rest.'] },
  examen: { ...base, format: 'examen', label: 'Evening Examen', cite: 'An evening examen, after St. Ignatius of Loyola', dim: true,
    segments: ['What moment today are you most grateful for?', 'Where did you feel far from peace, and why?', 'What would you like to carry gently into tomorrow?',
      'May you rest tonight in the knowledge that you are held.'] },
  week: { ...base, format: 'week', label: 'This Week', cite: '', audio: 'dawn',
    slides: files.map((f, i) => ({ image_url: f, label: posts[i][0], day: days[i] })) },
};

for (const [name, job] of Object.entries(jobs)) {
  if (only.length && !only.includes(name)) continue;
  const out = path.join(outDir, `${name}.mp4`);
  const t0 = Date.now();
  const res = await renderReel({ id: name, ...job }, out, { photo: name === 'breath' ? wide : photo, poster: path.join(outDir, `${name}-poster.jpg`) });
  const size = fs.statSync(out).size;
  // contact sheet: 8 frames across the Reel
  const sheetDir = path.join(fx, `sheet-${name}`);
  fs.mkdirSync(sheetDir, { recursive: true });
  [0.01, 0.1, 0.22, 0.36, 0.5, 0.64, 0.8, 0.97].forEach((f, i) =>
    ff('-ss', (res.duration * f).toFixed(2), '-i', out, '-frames:v', '1', '-vf', 'scale=270:480', path.join(sheetDir, `f${i}.png`)));
  ff('-i', path.join(sheetDir, 'f%d.png'), '-vf', 'tile=8x1:padding=6:color=white', '-frames:v', '1', path.join(outDir, `${name}-sheet.png`));
  console.log(JSON.stringify({ name, ...res, mb: +(size / 1e6).toFixed(1), seconds: (Date.now() - t0) / 1000 }));
}
