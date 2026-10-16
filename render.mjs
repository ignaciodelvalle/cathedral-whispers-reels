// Cathedral Whispers Reel renderer: one job -> one 1080x1920 MP4 (H.264 + AAC).
// The look: a slow push into a sacred image, the title in gilded small caps, the passage
// appearing phrase by phrase, an end card with the citation, under a quiet organ bed.
//
//   node render.mjs --job job.json --out out.mp4 [--photo local.jpg] [--poster poster.jpg]
//
// job = { id, label, segments: [..], cite, brand, photo_url, subject, audio, motion }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const W = 1080, H = 1920, FPS = 30;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const UA = 'CathedralWhispersReels/1.0 (https://www.facebook.com/1369036466295297)';

const font = (f) => fs.readFileSync(path.join(HERE, 'fonts', f));
const FONTS = [
  { name: 'EB Garamond', weight: 500, style: 'normal', data: font('eb-garamond-latin-500-normal.woff') },
  { name: 'EB Garamond', weight: 500, style: 'normal', data: font('eb-garamond-latin-ext-500-normal.woff') },
  { name: 'EB Garamond', weight: 500, style: 'italic', data: font('eb-garamond-latin-500-italic.woff') },
  { name: 'EB Garamond', weight: 500, style: 'italic', data: font('eb-garamond-latin-ext-500-italic.woff') },
  { name: 'Cinzel', weight: 500, style: 'normal', data: font('cinzel-latin-500-normal.woff') },
  { name: 'Cinzel', weight: 500, style: 'normal', data: font('cinzel-latin-ext-500-normal.woff') },
  { name: 'Cormorant', weight: 600, style: 'italic', data: font('cormorant-garamond-latin-600-italic.woff') },
  { name: 'Cormorant', weight: 600, style: 'italic', data: font('cormorant-garamond-latin-ext-600-italic.woff') },
];

const GOLD = '#e7cc8f';
const INK = '#fbf6ec';

// ---------- layout ----------
// Text lives in the safe zone: clear of the Reels header (top) and caption/buttons (bottom/right).
const BOX = { top: 430, bottom: 1430, side: 104 };
const words = (s) => s.trim().split(/\s+/).length;

function estimateHeight(segs, size) {
  const cpl = Math.floor((W - 2 * BOX.side) / (size * 0.46));
  let h = 0;
  for (const s of segs) h += Math.ceil(s.length / cpl) * size * 1.3;
  return h + Math.max(0, segs.length - 1) * size * 0.5;
}

// Greedy pages at the largest size that keeps pages few and comfortable.
function paginate(segments) {
  const maxH = BOX.bottom - BOX.top;
  const total = segments.join(' ').length;
  for (const size of [74, 70, 66, 62, 58, 54]) {
    const pages = [];
    let cur = [];
    for (const s of segments) {
      const next = [...cur, s];
      if (cur.length && (estimateHeight(next, size) > maxH * 0.9 || next.join(' ').length > 250)) { pages.push(cur); cur = []; }
      cur.push(s);
    }
    if (cur.length) pages.push(cur);
    const fits = pages.every((pg) => estimateHeight(pg, size) <= maxH * 0.95);
    if ((fits && pages.length <= Math.max(1, Math.ceil(total / 230))) || size === 54) return { size, pages };
  }
}

// ---------- drawing ----------
const shadow = '0 2px 18px rgba(0,0,0,0.55)';

function pageTree(segs, size, visible) {
  return {
    type: 'div',
    props: {
      style: { width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        paddingTop: BOX.top, paddingBottom: H - BOX.bottom, paddingLeft: BOX.side, paddingRight: BOX.side },
      children: segs.map((s, i) => ({
        type: 'div',
        props: {
          style: { display: 'flex', justifyContent: 'center', textAlign: 'center', width: '100%',
            fontFamily: 'EB Garamond', fontSize: size, lineHeight: 1.28, color: INK, textShadow: shadow, textWrap: 'balance',
            marginTop: i ? size * 0.5 : 0, opacity: visible.includes(i) ? 1 : 0 },
          children: s,
        },
      })),
    },
  };
}

function labelTree(label) {
  return {
    type: 'div',
    props: {
      style: { width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 270 },
      children: [
        { type: 'div', props: { style: { fontFamily: 'Cinzel', fontSize: 44, letterSpacing: 8, color: GOLD, textShadow: shadow, textAlign: 'center', paddingLeft: 90, paddingRight: 90 }, children: label.toUpperCase() } },
        { type: 'div', props: { style: { display: 'flex', alignItems: 'center', marginTop: 22 }, children: [
          { type: 'div', props: { style: { width: 70, height: 2, background: GOLD, opacity: 0.85 } } },
          { type: 'div', props: { style: { width: 9, height: 9, background: GOLD, transform: 'rotate(45deg)', marginLeft: 14, marginRight: 14 } } },
          { type: 'div', props: { style: { width: 70, height: 2, background: GOLD, opacity: 0.85 } } },
        ] } },
      ],
    },
  };
}

function endTree(cite, brand) {
  return {
    type: 'div',
    props: {
      style: { width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingLeft: 120, paddingRight: 120, paddingBottom: 140 },
      children: [
        { type: 'div', props: { style: { fontFamily: 'Cormorant', fontStyle: 'italic', fontSize: 50, lineHeight: 1.3, color: INK, textAlign: 'center', textShadow: shadow, textWrap: 'balance' }, children: cite } },
        { type: 'div', props: { style: { width: 120, height: 2, background: GOLD, marginTop: 44, marginBottom: 40 } } },
        { type: 'div', props: { style: { fontFamily: 'Cinzel', fontSize: 34, letterSpacing: 8, color: GOLD, textShadow: shadow }, children: brand.toUpperCase() } },
      ],
    },
  };
}

function shadeTree() {
  // darker at the top (title) and through the text block, deepest at the bottom (Reels caption area)
  return {
    type: 'div',
    props: { style: { width: W, height: H, display: 'flex',
      backgroundImage: 'linear-gradient(180deg, rgba(8,6,4,0.62) 0%, rgba(8,6,4,0.40) 18%, rgba(8,6,4,0.46) 45%, rgba(8,6,4,0.58) 70%, rgba(8,6,4,0.82) 100%)' } },
  };
}

async function png(tree, file) {
  const svg = await satori(tree, { width: W, height: H, fonts: FONTS });
  const img = new Resvg(svg, { fitTo: { mode: 'original' } }).render();
  fs.writeFileSync(file, img.asPng());
  const px = img.pixels;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (px[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return { file, box: { x: 0, y: 0, w: 2, h: 2 } };
  // even sizes/offsets keep yuv420p happy
  x0 = Math.max(0, (x0 - 4) & ~1); y0 = Math.max(0, (y0 - 4) & ~1);
  x1 = Math.min(W, x1 + 6); y1 = Math.min(H, y1 + 6);
  return { file, box: { x: x0, y: y0, w: (x1 - x0 + 1) & ~1, h: (y1 - y0 + 1) & ~1 } };
}

// ---------- timing ----------
function timeline(pages) {
  const FADE_IN = 0.7, PAGE_OUT = 0.8, GAP = 0.35;
  const segTimes = [];      // {page, idx, start}
  const pageEnds = [];
  let t = 0;
  pages.forEach((segs, p) => {
    segs.forEach((s, i) => {
      const start = p === 0 && i === 0 ? 0 : t;         // first line is on screen from frame 0 (good cover frame)
      segTimes.push({ page: p, idx: i, start });
      const read = Math.min(7.5, Math.max(2.2, 0.9 + 0.37 * words(s)));
      t = start + read;
    });
    t += 1.6;                                           // let the page rest
    pageEnds.push(t);
    t += PAGE_OUT + GAP;
  });
  const textEnd = pageEnds[pageEnds.length - 1];
  const endStart = textEnd + 0.5;
  const total = endStart + 3.6;
  return { segTimes, pageEnds, textEnd, endStart, total, FADE_IN, PAGE_OUT };
}

// ---------- background ----------
function originalUrl(u) {
  // https://upload.wikimedia.org/.../thumb/a/ab/File.jpg/1280px-File.jpg -> original file
  const m = u.match(/^(https:\/\/[^/]+\/wikipedia\/commons)\/thumb\/(.+?)\/[^/]+$/);
  return m ? `${m[1]}/${m[2]}` : u;
}

async function fetchPhoto(job, dir) {
  const file = path.join(dir, 'photo');
  const tries = [job.photo_url.replace('thumb.wikimedia.org', 'upload.wikimedia.org')];
  const orig = originalUrl(tries[0]);
  if ((job.photo_w ?? 0) >= 3840) tries.unshift(tries[0].replace(/\/\d+px-/, '/3840px-'));
  else tries.unshift(orig);
  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return file;
    } catch (e) { console.warn('photo fetch failed', u, e.message); }
  }
  throw new Error('could not download photo');
}

function backgroundFilter(total, motion) {
  // One decoded photo -> cover-crop to 9:16 at 2x -> zoompan emits every frame from that single image.
  const S = 2, BW = W * S, BH = H * S;
  const frames = Math.ceil(total * FPS) + 2;
  const zEnd = 1.12;
  let z, x, y;
  if (motion === 'rise') {          // lift the eyes: start low, drift up while easing in
    z = `1.07+0.04*on/${frames}`;
    x = `iw/2-(iw/zoom/2)`;
    y = `(ih-ih/zoom)*(1-on/${frames})`;
  } else if (motion === 'out') {
    z = `${zEnd}-${(zEnd - 1).toFixed(3)}*on/${frames}`;
    x = `iw/2-(iw/zoom/2)`; y = `ih/2-(ih/zoom/2)`;
  } else {                          // default: gentle push in
    z = `1+${(zEnd - 1).toFixed(3)}*on/${frames}`;
    x = `iw/2-(iw/zoom/2)`; y = `ih/2-(ih/zoom/2)`;
  }
  return `scale=${BW}:${BH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${BW}:${BH},` +
    `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p`;
}

// ---------- main ----------
export async function renderReel(job, out, opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
  const brand = job.brand ?? 'Cathedral Whispers';
  const { size, pages } = paginate(job.segments);
  const tl = timeline(pages);
  const photo = opts.photo ?? await fetchPhoto(job, dir);
  const motion = job.motion ?? (/(ceiling|dome)/.test(job.subject ?? '') ? 'rise' : 'in');
  const frames = Math.ceil(tl.total * FPS);

  // layers: shade, label, one PNG per segment (others invisible so positions stay exact), end card
  const shade = await png(shadeTree(), path.join(dir, 'shade.png'));
  const label = await png(labelTree(job.label), path.join(dir, 'label.png'));
  const segs = [];
  for (const st of tl.segTimes) {
    const r = await png(pageTree(pages[st.page], size, [st.idx]), path.join(dir, `seg-${st.page}-${st.idx}.png`));
    segs.push({ ...r, in: st.start, out: tl.pageEnds[st.page], firstFrame: st.start === 0 });
  }
  const end = await png(endTree(job.cite, brand), path.join(dir, 'end.png'));

  const audio = path.join(HERE, 'audio', `${job.audio ?? 'dawn'}.m4a`);
  const stills = [shade, label, ...segs, end];
  const args = ['-y', '-loglevel', 'error', '-i', photo];
  stills.forEach((l) => args.push('-i', l.file));
  args.push('-i', audio);
  const audioIdx = 1 + stills.length;

  // each still is decoded once, cropped to its opaque box, then repeated in memory
  const hold = (i, l) => `[${i}:v]crop=${l.box.w}:${l.box.h}:${l.box.x}:${l.box.y},format=rgba,loop=loop=${frames}:size=1:start=0,setpts=N/${FPS}/TB`;
  const f = [];
  f.push(`[0:v]${backgroundFilter(tl.total, motion)}[bg]`);
  f.push(`${hold(1, shade)}[sh]`);
  f.push(`[bg][sh]overlay=${shade.box.x}:${shade.box.y}:shortest=1[v0]`);
  f.push(`${hold(2, label)},fade=t=out:st=${tl.textEnd.toFixed(2)}:d=${tl.PAGE_OUT}:alpha=1[lab]`);
  f.push(`[v0][lab]overlay=${label.box.x}:${label.box.y}:shortest=1[v1]`);
  let last = 'v1';
  segs.forEach((l, i) => {
    const fin = l.firstFrame ? '' : `,fade=t=in:st=${l.in.toFixed(2)}:d=${tl.FADE_IN}:alpha=1`;
    f.push(`${hold(3 + i, l)}${fin},fade=t=out:st=${l.out.toFixed(2)}:d=${tl.PAGE_OUT}:alpha=1[s${i}]`);
    f.push(`[${last}][s${i}]overlay=${l.box.x}:${l.box.y}:shortest=1[w${i}]`);
    last = `w${i}`;
  });
  f.push(`${hold(3 + segs.length, end)},fade=t=in:st=${tl.endStart.toFixed(2)}:d=0.9:alpha=1[end]`);
  f.push(`[${last}][end]overlay=${end.box.x}:${end.box.y}:shortest=1,format=yuv420p[vout]`);
  const fadeOut = Math.max(0, tl.total - 2.8);
  f.push(`[${audioIdx}:a]atrim=0:${tl.total.toFixed(2)},afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeOut.toFixed(2)}:d=2.8,aresample=48000[aout]`);

  args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', opts.preset ?? 'medium', '-crf', '20', '-profile:v', 'high', '-r', String(FPS),
    '-g', String(FPS * 2), '-keyint_min', String(FPS * 2), '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-t', tl.total.toFixed(2), '-movflags', '+faststart', out);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });

  // poster: the first page fully revealed (for the review page thumbnail)
  let poster = null;
  if (opts.poster) {
    const p1 = await png(pageTree(pages[0], size, pages[0].map((_, i) => i)), path.join(dir, 'p1.png'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', photo, '-i', shade.file, '-i', label.file, '-i', p1.file,
      '-filter_complex', `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[b];[b][1:v]overlay[x];[x][2:v]overlay[y];[y][3:v]overlay,scale=360:640`,
      '-frames:v', '1', '-q:v', '5', opts.poster]);
    poster = opts.poster;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { duration: Number(tl.total.toFixed(2)), pages: pages.length, size, poster };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const job = JSON.parse(fs.readFileSync(arg('--job'), 'utf8'));
  const t0 = Date.now();
  const res = await renderReel(job, arg('--out') ?? 'out.mp4', { photo: arg('--photo'), poster: arg('--poster'), preset: arg('--preset') });
  console.log(JSON.stringify({ ...res, seconds: (Date.now() - t0) / 1000 }));
}
