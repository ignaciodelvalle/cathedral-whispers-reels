// Cathedral Whispers Reel renderer: one job -> one 1080x1920 MP4 (H.264 + AAC).
// The look: a slow push into a sacred image, the title in gilded small caps, the passage
// appearing phrase by phrase, an end card with the citation, under a quiet organ bed.
//
//   node render.mjs --job job.json --out out.mp4 [--photo local.jpg] [--poster poster.jpg]
//
// job = { id, label, segments: [..], cite, brand, photo_url, subject, audio, motion,
//         format?, place?, dim?, teaser?: {image_url, first_line, when}, slides?: [{image_url, label, day}], end_line? }
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
const shadow = '0 2px 6px rgba(0,0,0,0.65), 0 0 30px rgba(0,0,0,0.6)';

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
      backgroundImage: 'radial-gradient(ellipse 620px 760px at 50% 46%, rgba(8,6,4,0.38) 0%, rgba(8,6,4,0.22) 55%, rgba(8,6,4,0) 100%), linear-gradient(180deg, rgba(8,6,4,0.70) 0%, rgba(8,6,4,0.46) 17%, rgba(8,6,4,0.50) 45%, rgba(8,6,4,0.62) 72%, rgba(8,6,4,0.86) 100%)' } },
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

// ======================================================================
// More formats. Everything below shares one composer: a moving background, then still layers
// (each a transparent PNG cropped to its box, with optional fade in/out), the end card, and the
// optional extras (place caption, light-to-dark ending, tomorrow card).
// ======================================================================
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const f2 = (n) => n.toFixed(2);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const box = (style, children) => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } });
const frame = (style, children = []) => box({ width: W, height: H, ...style }, children);
const ornament = (my = 22) => box({ alignItems: 'center', marginTop: my, marginBottom: my }, [
  box({ width: 70, height: 2, background: GOLD, opacity: 0.85 }),
  box({ width: 9, height: 9, background: GOLD, transform: 'rotate(45deg)', marginLeft: 14, marginRight: 14 }),
  box({ width: 70, height: 2, background: GOLD, opacity: 0.85 }),
]);
const prose = (size, extra = {}) => ({ fontFamily: 'EB Garamond', fontSize: size, lineHeight: 1.28, color: INK, textShadow: shadow,
  textAlign: 'center', justifyContent: 'center', textWrap: 'balance', width: '100%', ...extra });

const pickSize = (segs, sizes, maxH) => sizes.find((s) => estimateHeight(segs, s) <= maxH) ?? sizes[sizes.length - 1];

async function fetchTo(src, file) {
  if (!/^https?:\/\//.test(src)) { fs.copyFileSync(src, file); return file; }   // local file (tests)
  const r = await fetch(src, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`download failed (HTTP ${r.status}): ${src}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
}

function dims(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file]).toString().trim();
  const [w, h] = out.split('x').map(Number);
  return { w, h };
}

// satori embeds images as data URLs; a downsized JPEG keeps that light
function dataUrl(file, w) {
  const small = `${file}-${w}.jpg`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', `scale=${w}:-2:flags=lanczos`, '-frames:v', '1', '-q:v', '3', small]);
  return `data:image/jpeg;base64,${fs.readFileSync(small).toString('base64')}`;
}

async function raster(tree, w, h, file) {
  const svg = await satori(tree, { width: w, height: h, fonts: FONTS });
  fs.writeFileSync(file, new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng());
  return file;
}

// ---------- trees ----------
const placeTree = (place) => frame({ flexDirection: 'column', alignItems: 'center', paddingTop: 382, paddingLeft: 120, paddingRight: 120 }, [
  box({ ...prose(31, { fontStyle: 'italic', lineHeight: 1.25, letterSpacing: 0.6, color: '#efe3c8' }) }, place),
]);

// light to dark: a warm candle glow in the middle, the edges falling into night
const dimTree = () => frame({ backgroundImage: 'radial-gradient(ellipse 640px 860px at 50% 50%, rgba(58,30,6,0.34) 0%, rgba(22,11,3,0.66) 55%, rgba(6,3,1,0.90) 100%)' });

async function teaserTree(teaser, dir) {
  const file = await fetchTo(teaser.image_url, path.join(dir, 'teaser-src'));
  const { w, h } = dims(file);
  let pw = 440, ph = Math.round(pw * h / w);
  if (ph > 600) { ph = 600; pw = Math.round(ph * w / h); }
  return frame({ flexDirection: 'column', alignItems: 'center', paddingTop: 352, backgroundColor: 'rgba(8,6,4,0.66)' }, [
    box({ fontFamily: 'Cinzel', fontSize: 40, letterSpacing: 7, color: GOLD, textShadow: shadow }, String(teaser.when).replace(/[\u202f\u00a0]/g, ' ').toUpperCase()),
    ornament(20),
    box({ marginTop: 22, padding: 14, backgroundColor: '#f2e9d6', boxShadow: '0 22px 60px rgba(0,0,0,0.65)', transform: 'rotate(-1.4deg)' }, [
      { type: 'img', props: { src: dataUrl(file, 900), width: pw, height: ph, style: { width: pw, height: ph } } },
    ]),
    box({ ...prose(46, { fontStyle: 'italic', lineHeight: 1.3, marginTop: 50, paddingLeft: 130, paddingRight: 130 }) }, teaser.first_line ?? ''),
  ]);
}

// one passage, laid out word by word: 'ghost' shows every word faint, a number lights just that word
function wordsTree(tokens, size, lit) {
  return frame({ flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    paddingTop: BOX.top, paddingBottom: H - BOX.bottom, paddingLeft: BOX.side - 10, paddingRight: BOX.side - 10 }, [
    box({ flexWrap: 'wrap', justifyContent: 'center', width: '100%' }, tokens.map((t, i) => box({
      fontFamily: 'EB Garamond', fontSize: size, lineHeight: 1.3, color: INK, textShadow: shadow,
      marginLeft: size * 0.13, marginRight: size * 0.13, opacity: lit === 'ghost' ? 0.24 : (i === lit ? 1 : 0),
    }, t))),
  ]);
}

const verseTree = (verse, size, top) => frame({ flexDirection: 'column', alignItems: 'center', paddingTop: top, paddingLeft: BOX.side, paddingRight: BOX.side }, [
  box(prose(size), verse),
]);

const cueTree = (word, top) => frame({ flexDirection: 'column', alignItems: 'center', paddingTop: top }, [
  box({ fontFamily: 'Cinzel', fontSize: 38, letterSpacing: 9, color: GOLD, textShadow: shadow }, word.toUpperCase()),
]);

// the breathing ring, drawn white on black at 2x: it becomes the alpha of a gold layer
const RING_CANVAS = 1280, RING_D = 600, RING_OUT = 640;
const ringTree = () => box({ width: RING_CANVAS, height: RING_CANVAS, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }, [
  box({ width: RING_D, height: RING_D, borderRadius: RING_D / 2, border: '5px solid #fff',
    boxShadow: '0 0 34px 4px rgba(255,255,255,0.55), inset 0 0 34px 2px rgba(255,255,255,0.32)',
    backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 62%, rgba(255,255,255,0) 100%)' }),
]);

const examenTree = (str, size, numeral) => frame({ flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  paddingTop: BOX.top, paddingBottom: H - BOX.bottom, paddingLeft: BOX.side, paddingRight: BOX.side }, [
  numeral
    ? box({ fontFamily: 'Cinzel', fontSize: 42, letterSpacing: 6, color: GOLD, textShadow: shadow, marginBottom: 36 }, numeral)
    : ornament(0),
  box(prose(size, numeral ? {} : { fontStyle: 'italic', marginTop: 40 }), str),
]);

const weekTitleTree = (label, sub) => frame({ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 140, paddingLeft: 100, paddingRight: 100 }, [
  box({ fontFamily: 'Cinzel', fontSize: 58, letterSpacing: 12, color: GOLD, textShadow: shadow, textAlign: 'center', justifyContent: 'center' }, label.toUpperCase()),
  ornament(28),
  box(prose(54, { fontStyle: 'italic' }), sub),
]);

const dayTree = (day) => frame({ flexDirection: 'column', alignItems: 'center', paddingTop: 316 }, [
  box({ fontFamily: 'Cinzel', fontSize: 38, letterSpacing: 9, color: GOLD, textShadow: shadow }, day.toUpperCase()),
]);

// ---------- motion ----------
// a still -> 2x cover crop -> zoompan from zA to zB over exactly `dur` seconds
function stillClip(dur, zA, zB) {
  const S = 2, frames = Math.round(dur * FPS);
  return `scale=${W * S}:${H * S}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W * S}:${H * S},` +
    `zoompan=z='${zA}+${(zB - zA).toFixed(4)}*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p`;
}

// a week slide: the rendered post centred on a blurred, darkened copy of itself
function slideStill(src, file) {
  const fw = 800, fh = 1000, fx = (W - fw) / 2, fy = 420;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-filter_complex',
    `[0:v]split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=36,eq=brightness=-0.22:saturation=0.7,` +
    `drawbox=x=${fx + 6}:y=${fy + 22}:w=${fw - 12}:h=${fh}:color=black@0.55:t=fill,gblur=sigma=16[bg];` +
    `[b]scale=${fw}:${fh}:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:${fy}+(${fh}-h)/2`,
    '-frames:v', '1', '-q:v', '2', file]);
  return file;
}

const fades = (l) => (l.from != null ? `,fade=t=in:st=${f2(l.from)}:d=${l.fin ?? 0.7}:alpha=1` : '') +
  (l.to != null ? `,fade=t=out:st=${f2(l.to)}:d=${l.fout ?? 0.8}:alpha=1` : '');

function encode({ base, layers, total, audio, out, preset }) {
  const frames = Math.ceil(total * FPS);
  const args = ['-y', '-loglevel', 'error'];
  base.inputs.forEach((f) => args.push('-i', f));
  const off = base.inputs.length;
  layers.forEach((l) => args.push('-i', l.file));
  args.push('-i', audio);
  const audioIdx = off + layers.length;
  const f = [...base.filters];                                       // ends in [bg]
  let last = 'bg';
  layers.forEach((l, i) => {
    const idx = off + i;
    const src = l.build
      ? l.build(idx, frames, total)                                  // a moving layer (the ring)
      : [`[${idx}:v]crop=${l.box.w}:${l.box.h}:${l.box.x}:${l.box.y},format=rgba,loop=loop=${frames}:size=1:start=0,setpts=N/${FPS}/TB`];
    src[src.length - 1] += `${fades(l)}[l${i}]`;
    f.push(...src);
    f.push(`[${last}][l${i}]overlay=${l.build ? l.x : l.box.x}:${l.build ? l.y : l.box.y}:shortest=1[o${i}]`);
    last = `o${i}`;
  });
  f.push(`[${last}]format=yuv420p[vout]`);
  const fadeOut = Math.max(0, total - 2.8);
  f.push(`[${audioIdx}:a]atrim=0:${f2(total)},afade=t=in:st=0:d=1.2,afade=t=out:st=${f2(fadeOut)}:d=2.8,aresample=48000[aout]`);
  args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', preset ?? 'medium', '-crf', '23', '-maxrate', '4500k', '-bufsize', '9000k', '-profile:v', 'high', '-r', String(FPS),
    '-g', String(FPS * 2), '-keyint_min', String(FPS * 2), '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-t', f2(total), '-movflags', '+faststart', out);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
}

// ---------- formats ----------
// Each builder returns the format's own layers and when its end card starts; renderFormat adds the rest.
const BUILDERS = {
  // the classic Reel, with extras (place / dim / teaser) layered on
  async passage({ job, dir }) {
    const { size, pages } = paginate(job.segments);
    const tl = timeline(pages);
    const layers = [{ ...(await png(labelTree(job.label), path.join(dir, 'label.png'))), from: null, to: tl.textEnd, fout: tl.PAGE_OUT }];
    for (const st of tl.segTimes) {
      const r = await png(pageTree(pages[st.page], size, [st.idx]), path.join(dir, `seg-${st.page}-${st.idx}.png`));
      layers.push({ ...r, from: st.start === 0 ? null : st.start, fin: tl.FADE_IN, to: tl.pageEnds[st.page], fout: tl.PAGE_OUT });
    }
    return { layers, endStart: tl.endStart, posterAt: tl.pageEnds[0] - 0.3, size, pages: pages.length };
  },

  // one short passage, its words lighting up one by one over a faint ghost of the whole text
  async oneline({ job, dir }) {
    const text = job.segments.join(' ').trim();
    const tokens = text.split(/\s+/);
    const size = pickSize([text], [84, 78, 72, 66, 60, 56, 52], (BOX.bottom - BOX.top) * 0.78);
    const weight = (t) => 0.75 + 0.05 * t.length + (/[.;:!?]["'”’)]?$/.test(t) ? 0.9 : /[,—–]["'”’)]?$/.test(t) ? 0.45 : 0);
    const sumW = tokens.reduce((a, t) => a + weight(t), 0);
    const k = clamp(tokens.length * 0.62, 8, 16) / sumW;
    let t = 0.8;
    const starts = tokens.map((tok) => { const s = t; t += weight(tok) * k; return s; });
    const textEnd = t + 3.2;
    const layers = [
      { ...(await png(labelTree(job.label), path.join(dir, 'label.png'))), from: null, to: textEnd },
      { ...(await png(wordsTree(tokens, size, 'ghost'), path.join(dir, 'ghost.png'))), from: null, to: textEnd },
    ];
    for (let i = 0; i < tokens.length; i++) {
      layers.push({ ...(await png(wordsTree(tokens, size, i), path.join(dir, `w${i}.png`))), from: starts[i], fin: 0.55, to: textEnd });
    }
    return { layers, endStart: textEnd + 0.5, posterAt: t + 1.6, size };
  },

  // breathe in 4 s, hold 4 s, let go 6 s, three times, under one verse
  async breath({ job, dir }) {
    const verse = job.segments.join(' ').trim();
    const size = pickSize([verse], [62, 58, 54, 50, 46, 42], 340);
    const verseL = await png(verseTree(verse, size, 440), path.join(dir, 'verse.png'));
    const vBottom = verseL.box.y + verseL.box.h;
    const center = clamp(vBottom + 320, 960, 1100);
    const rMax = clamp(center - vBottom - 50, 190, 262);              // largest visible radius
    const zMax = rMax / (RING_D / 2 / (RING_CANVAS / RING_OUT));       // ring rests at radius 150
    const cueTop = Math.min(1392, center + rMax + 46);
    const ring = await raster(ringTree(), RING_CANVAS, RING_CANVAS, path.join(dir, 'ring.png'));
    const B0 = 3, CYCLE = 14, N = 3;
    const T = `(on/${FPS}-${B0})`, P = `mod(${T},${CYCLE})`, A = (zMax - 1).toFixed(4);
    const z = `if(lt(${T},0)+gte(${T},${CYCLE * N}),1,if(lt(${P},4),1+${A}*(1-cos(PI*${P}/4))/2,if(lt(${P},8),${zMax.toFixed(4)},${zMax.toFixed(4)}-${A}*(1-cos(PI*(${P}-8)/6))/2)))`;
    const textEnd = B0 + CYCLE * N + 1;
    const ringLayer = {
      file: ring, x: (W - RING_OUT) / 2, y: center - RING_OUT / 2, from: null, to: textEnd,
      build: (idx, frames, total) => [
        `[${idx}:v]format=gray,zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames + 2}:s=${RING_OUT}x${RING_OUT}:fps=${FPS},format=gray[ra${idx}]`,
        `color=c=0xE7CC8F:s=${RING_OUT}x${RING_OUT}:r=${FPS}:d=${f2(total + 0.2)}[gc${idx}]`,
        `[gc${idx}][ra${idx}]alphamerge,format=rgba`,
      ],
    };
    const cue = async (word) => png(cueTree(word, cueTop), path.join(dir, `cue-${word.replace(/\W/g, '')}.png`));
    const [withMe, inn, hold, out] = [await cue('Breathe with me'), await cue('Breathe in'), await cue('Hold'), await cue('Let go')];
    const layers = [
      { ...(await png(labelTree(job.label), path.join(dir, 'label.png'))), from: null, to: textEnd },
      { ...verseL, from: null, to: textEnd },
      ringLayer,
      { ...withMe, from: null, to: B0 - 0.5, fout: 0.45 },
    ];
    for (let c = 0; c < N; c++) {
      const b = B0 + c * CYCLE;
      layers.push({ ...inn, from: b, fin: 0.5, to: b + 3.45, fout: 0.5 });
      layers.push({ ...hold, from: b + 4, fin: 0.5, to: b + 7.45, fout: 0.5 });
      layers.push({ ...out, from: b + 8, fin: 0.5, to: b + 13.3, fout: 0.6 });
    }
    return { layers, endStart: textEnd + 0.5, posterAt: B0 + 5.5, size, audio: 'stillness' };
  },

  // three questions, one at a time, then a blessing
  async examen({ job, dir }) {
    const segs = job.segments.map((s) => s.trim()).filter(Boolean);
    if (segs.length < 2) throw new Error('examen needs at least one question and a closing blessing');
    const questions = segs.slice(0, -1), blessing = segs[segs.length - 1];
    const layers = [];
    let t = 0, to = 0;
    for (let i = 0; i <= questions.length; i++) {
      const isQ = i < questions.length, str = isQ ? questions[i] : blessing;
      const size = pickSize([str], [72, 68, 64, 60, 56, 52], 640);
      const l = await png(examenTree(str, size, isQ ? ROMAN[i] : null), path.join(dir, `ex-${i}.png`));
      const dur = isQ ? clamp(4.8 + 0.16 * words(str), 6, 7.5) : clamp(4.5 + 0.2 * words(str), 6, 8);
      const from = i === 0 ? null : t;
      to = (i === 0 ? 0 : t + 0.9) + dur;
      layers.push({ ...l, from, fin: 0.9, to, fout: 0.8 });
      t = to + 1.2;
    }
    layers.unshift({ ...(await png(labelTree(job.label), path.join(dir, 'label.png'))), from: null, to });
    return { layers, endStart: to + 0.5, posterAt: 3, audio: 'vespers' };
  },

  // the week's morning posts, one after another, then "a new passage every morning"
  async week({ job, dir, photo }) {
    const slides = (job.slides ?? []).filter((s) => s?.image_url);
    if (slides.length < 3) throw new Error(`week Reel needs at least 3 slides, got ${slides.length}`);
    const stills = [];
    for (let i = 0; i < slides.length; i++) {
      const src = await fetchTo(slides[i].image_url, path.join(dir, `slide-src-${i}`));
      stills.push(slideStill(src, path.join(dir, `slide-${i}.jpg`)));
    }
    const F = 0.8, TITLE = 3.8, SLIDE = 3.7;
    const starts = [0];
    starts.push(TITLE - F);
    for (let i = 1; i < slides.length; i++) starts.push(starts[i] + SLIDE - F);
    const endClip = starts[slides.length] + SLIDE - F;                  // when the closing photo starts fading in
    const label = job.label || 'This Week';
    const n = slides.length;
    const sub = `${NUMBER[n][0].toUpperCase()}${NUMBER[n].slice(1)} mornings, ${NUMBER[n]} passages`;
    const shade = await png(shadeTree(), path.join(dir, 'shade.png'));
    const layers = [
      { ...shade, from: null, to: starts[1], fout: F },
      { ...shade, from: endClip, fin: F },
      { ...(await png(weekTitleTree(label, sub), path.join(dir, 'title.png'))), from: null, to: starts[1] - 0.2, fout: F },
    ];
    for (let i = 0; i < n; i++) {
      const day = await png(dayTree(slides[i].day ?? ''), path.join(dir, `day-${i}.png`));
      const next = i + 1 < n ? starts[i + 2] : endClip;
      layers.push({ ...day, from: starts[i + 1] + 0.2, fin: F, to: next, fout: F * 0.75 });
    }
    const base = (total) => {
      const tail = total - endClip;
      const f = [`[0:v]split=2[pa][pb]`, `[pa]${stillClip(TITLE, 1.0, 1.05)}[c0]`];
      stills.forEach((_, i) => f.push(`[${i + 1}:v]${stillClip(SLIDE, 1.0, 1.04)}[c${i + 1}]`));
      f.push(`[pb]${stillClip(tail, 1.05, 1.11)}[c${n + 1}]`);
      let acc = 'c0', len = TITLE;
      const lens = [...stills.map(() => SLIDE), tail];
      lens.forEach((d, i) => {
        const outL = i === lens.length - 1 ? 'bg' : `x${i + 1}`;
        f.push(`[${acc}][c${i + 1}]xfade=transition=fade:duration=${F}:offset=${f2(len - F)}[${outL}]`);
        acc = outL; len += d - F;
      });
      return { inputs: [photo, ...stills], filters: f };
    };
    return { below: [], layers, base, endStart: endClip + 0.5, endText: job.end_line ?? 'A new passage every morning · 7:30 AM',
      posterAt: starts[1] + F + 0.6, pages: n };
  },
};

async function renderFormat(job, out, opts, builder) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
  const brand = job.brand ?? 'Cathedral Whispers';
  const photo = opts.photo ?? await fetchPhoto(job, dir);
  const motion = job.motion ?? (/(ceiling|dome)/.test(job.subject ?? '') ? 'rise' : 'in');
  const plan = await builder({ job, dir, photo, motion });
  const teaser = job.teaser && typeof job.teaser === 'object' && job.teaser.image_url && job.teaser.when ? job.teaser : null;
  const endStart = plan.endStart;
  const total = endStart + (teaser ? 8.2 : 3.6);

  const layers = plan.below ?? [{ ...(await png(shadeTree(), path.join(dir, 'shade.png'))), from: null }];
  if (job.dim) {
    const from = Math.max(0.5, endStart - 2.4);
    layers.push({ ...(await png(dimTree(), path.join(dir, 'dim.png'))), from, fin: Number(f2(Math.min(6, total - 0.4 - from))) });
  }
  layers.push(...plan.layers);
  if (job.place) layers.push({ ...(await png(placeTree(String(job.place).slice(0, 90)), path.join(dir, 'place.png'))), from: null, to: 3.2, fout: 0.8 });
  layers.push({ ...(await png(endTree(plan.endText ?? job.cite ?? '', brand), path.join(dir, 'end.png'))), from: endStart, fin: 0.9,
    to: teaser ? endStart + 3.2 : null, fout: 0.6 });
  if (teaser) layers.push({ ...(await png(await teaserTree(teaser, dir), path.join(dir, 'teaser.png'))), from: endStart + 3.6, fin: 0.8 });

  const base = plan.base ? plan.base(total) : { inputs: [photo], filters: [`[0:v]${backgroundFilter(total, motion)}[bg]`] };
  const audio = path.join(HERE, 'audio', `${job.audio ?? plan.audio ?? 'dawn'}.m4a`);
  const video = opts.posterOnly ? path.join(dir, 'preview.mp4') : out;
  encode({ base, layers, total, audio, out: video, preset: opts.posterOnly ? 'ultrafast' : opts.preset });

  let poster = null;
  if (opts.poster) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', f2(clamp(plan.posterAt ?? 1, 0, total - 0.2)), '-i', video,
      '-frames:v', '1', '-vf', `scale=${opts.posterOnly ? '540:960' : '360:640'}`, '-q:v', '5', opts.poster]);
    poster = opts.poster;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { duration: Number(total.toFixed(2)), pages: plan.pages ?? 1, size: plan.size ?? null, poster, format: job.format ?? 'passage' };
}

// ---------- main ----------
// Formats: 'passage' (default) | 'oneline' | 'breath' | 'examen' | 'week'.
// Extras on any format: place (caption at the start), dim (light to dark at the end), teaser (tomorrow card).
export async function renderReel(job, out, opts = {}) {
  const format = job.format ?? 'passage';
  const extras = Boolean(job.place || job.dim || job.teaser);
  if (format === 'passage' && !extras) return renderClassic(job, out, opts);
  const builder = BUILDERS[format];
  if (!builder) throw new Error(`unknown reel format: ${format}`);
  return renderFormat(job, out, opts, builder);
}

// The original passage Reel, kept exactly as it was so existing Reels render identically.
async function renderClassic(job, out, opts = {}) {
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
    '-c:v', 'libx264', '-preset', opts.preset ?? 'medium', '-crf', '23', '-maxrate', '4500k', '-bufsize', '9000k', '-profile:v', 'high', '-r', String(FPS),
    '-g', String(FPS * 2), '-keyint_min', String(FPS * 2), '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-t', tl.total.toFixed(2), '-movflags', '+faststart', out);
  if (!opts.posterOnly) execFileSync('ffmpeg', args, { stdio: 'inherit' });

  // poster: the first page fully revealed (for the review page thumbnail)
  let poster = null;
  if (opts.poster) {
    const p1 = await png(pageTree(pages[0], size, pages[0].map((_, i) => i)), path.join(dir, 'p1.png'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', photo, '-i', shade.file, '-i', label.file, '-i', p1.file,
      '-filter_complex', `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[b];[b][1:v]overlay[x];[x][2:v]overlay[y];[y][3:v]overlay,scale=${opts.posterOnly ? '540:960' : '360:640'}`,
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
  const res = await renderReel(job, arg('--out') ?? 'out.mp4', { photo: arg('--photo'), poster: arg('--poster'), preset: arg('--preset'), posterOnly: process.argv.includes('--poster-only') });
  console.log(JSON.stringify({ ...res, seconds: (Date.now() - t0) / 1000 }));
}
