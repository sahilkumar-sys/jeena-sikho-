#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { convertSrtToAss } = require('./srt-to-styled-ass');
const { TRANSITION_EFFECTS } = require('./broll-transitions');
const MAX_BROLL_DURATION_SECONDS = 2;

function requiredFile(value, label) {
  if (!value || !fs.existsSync(value) || !fs.statSync(value).isFile()) {
    throw new Error(`${label} was not found: ${value}`);
  }
  return path.resolve(value);
}

function filterPath(value) {
  // Paths are embedded inside an FFmpeg filtergraph string, so normalize
  // separators and escape characters that have filtergraph meaning.
  return String(value).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: options.stdio || ['ignore', 'pipe', 'pipe'] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}\n${result.stderr || ''}`);
  return result.stdout || '';
}

function probe(video) {
  const data = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', video]));
  const videoStream = (data.streams || []).find((stream) => stream.width && stream.height);
  if (!videoStream) throw new Error('Could not read the base video dimensions.');
  return { duration: Number(data.format.duration), width: Number(videoStream.width), height: Number(videoStream.height) };
}

function transcriptEntries(transcript) {
  if (!transcript) return [];
  if (Array.isArray(transcript)) return transcript;
  if (Array.isArray(transcript.segments)) return transcript.segments;
  if (Array.isArray(transcript.words)) return transcript.words;
  return [];
}

function anchorTime(item, entries) {
  if (Number.isFinite(Number(item.start))) return Number(item.start);
  if (item.anchor) {
    const needle = String(item.anchor).toLowerCase();
    const hit = entries.find((entry) => String(entry.text ?? entry.word ?? '').toLowerCase().includes(needle));
    if (hit && Number.isFinite(Number(hit.start))) return Number(hit.start);
  }
  return -1;
}

function main() {
  const args = process.argv.slice(2);
  const manifestFlag = args.indexOf('--manifest');
  if (manifestFlag === -1 || !args[manifestFlag + 1]) throw new Error('Usage: node assemble-test-video.js --manifest /path/to/manifest.json');
  const manifestPath = requiredFile(args[manifestFlag + 1], 'Manifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const baseVideo = requiredFile(manifest.base_video, 'Base video');
  const subtitleSource = manifest.subtitle_file ? requiredFile(manifest.subtitle_file, 'Subtitle file') : null;
  const subtitleStyleFile = manifest.subtitle_style_file ? requiredFile(manifest.subtitle_style_file, 'Subtitle style template') : null;
  const subtitleFontsDir = manifest.subtitle_fonts_dir || null;
  if (subtitleFontsDir && (!fs.existsSync(subtitleFontsDir) || !fs.statSync(subtitleFontsDir).isDirectory())) {
    throw new Error(`Subtitle fonts directory was not found: ${subtitleFontsDir}`);
  }
  const info = probe(baseVideo);
  const avatar = manifest.avatar_composite || null;
  if (avatar?.enabled) {
    const crop = avatar.crop || {};
    for (const key of ['x', 'y', 'width', 'height']) {
      if (!Number.isFinite(Number(crop[key]))) throw new Error(`avatar_composite.crop.${key} must be a number.`);
    }
    if (Number(crop.x) < 0 || Number(crop.y) < 0 || Number(crop.width) <= 0 || Number(crop.height) <= 0 ||
        Number(crop.x) + Number(crop.width) > info.width || Number(crop.y) + Number(crop.height) > info.height) {
      throw new Error(`avatar_composite.crop must fit inside the source video (${info.width}x${info.height}).`);
    }
  }
  const transcript = manifest.transcript && fs.existsSync(manifest.transcript)
    ? JSON.parse(fs.readFileSync(manifest.transcript, 'utf8'))
    : null;
  const entries = transcriptEntries(transcript);
  const images = Array.isArray(manifest.images) ? manifest.images : [];
  if (!images.length) throw new Error('Manifest must contain at least one image.');
  const requestedTransition = Number(manifest.image_transition_seconds ?? 0.35);
  const imageTransitionSeconds = Number.isFinite(requestedTransition)
    ? Math.max(0, Math.min(requestedTransition, 1.0))
    : 0.35;
  const zoomStart = Number.isFinite(Number(manifest.image_zoom_start)) ? Number(manifest.image_zoom_start) : 1.0;
  const zoomEnd = Number.isFinite(Number(manifest.image_zoom_end)) ? Number(manifest.image_zoom_end) : 1.25;

  const placements = images.map((item, index) => {
    const imagePath = requiredFile(item.path || item.image_path, `B-roll image ${index + 1}`);
    let start = anchorTime(item, entries);
    if (start < 0) start = Math.max(0, ((index + 1) * info.duration / (images.length + 1)) - 1.5);
    start = Math.min(start, Math.max(0, info.duration - 0.25));
    const duration = Math.min(Number(item.duration || MAX_BROLL_DURATION_SECONDS), MAX_BROLL_DURATION_SECONDS);
    const end = Math.min(info.duration, start + duration);
    const focusXValue = Number(item.frame_focus_x ?? item.focus_x ?? item.focal_x ?? 0.5);
    const focusYValue = Number(item.frame_focus_y ?? item.focus_y ?? item.focal_y ?? 0.5);
    const focusX = Number.isFinite(focusXValue) ? Math.max(0, Math.min(1, focusXValue)) : 0.5;
    const focusY = Number.isFinite(focusYValue) ? Math.max(0, Math.min(1, focusYValue)) : 0.5;
    const transitionEffect = item.transition_effect ?? 'fade';
    if (!TRANSITION_EFFECTS.includes(transitionEffect)) {
      throw new Error(`B-roll image ${index + 1} has an unsupported transition: ${transitionEffect}`);
    }
    return {
      imagePath,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      duration: Number((end - start).toFixed(3)),
      focusX,
      focusY,
      transitionEffect,
    };
  }).filter((item) => item.end > item.start);
  if (!placements.length) throw new Error('No valid B-roll placements were produced.');

  const output = path.resolve(manifest.output_video || path.join(path.dirname(manifestPath), 'test-output.mp4'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  let subtitleFile = subtitleSource;
  if (subtitleSource && path.extname(subtitleSource).toLowerCase() === '.srt') {
    if (!subtitleStyleFile) throw new Error('subtitle_style_file is required when subtitle_file is an SRT.');
    subtitleFile = path.join(path.dirname(output), `${path.basename(output, path.extname(output))}.subtitles.ass`);
    fs.writeFileSync(subtitleFile, convertSrtToAss(fs.readFileSync(subtitleSource, 'utf8'), fs.readFileSync(subtitleStyleFile, 'utf8')), 'utf8');
  } else if (subtitleSource && path.extname(subtitleSource).toLowerCase() !== '.ass') {
    throw new Error('subtitle_file must be an .srt or .ass file.');
  }
  const ffmpegArgs = ['-y', '-i', baseVideo];
  for (const placement of placements) ffmpegArgs.push('-loop', '1', '-framerate', '25', '-i', placement.imagePath);

  let musicIndex = -1;
  if (manifest.music) {
    musicIndex = placements.length + 1;
    ffmpegArgs.push('-stream_loop', '-1', '-i', requiredFile(manifest.music, 'Background music'));
  }
  let transitionIndex = -1;
  if (manifest.transition_sound) {
    transitionIndex = placements.length + 1 + (musicIndex >= 0 ? 1 : 0);
    ffmpegArgs.push('-i', requiredFile(manifest.transition_sound, 'Transition sound'));
  }

  const filters = [];
  if (avatar?.enabled) {
    const crop = avatar.crop;
    const zoomX = Number(avatar.zoom_x ?? 3.01);
    const zoomY = Number(avatar.zoom_y ?? 3.0);
    const positionX = Number(avatar.position_x ?? -30);
    const positionY = Number(avatar.position_y ?? -48);
    const keyColor = String(avatar.key_color || '0x88b943');
    const similarity = Math.max(0, Math.min(1, Number(avatar.similarity ?? 0.075)));
    const blend = Math.max(0, Math.min(1, Number(avatar.blend ?? 0.025)));
    const despillMix = Math.max(0, Math.min(1, Number(avatar.despill_mix ?? 0.65)));
    const backgroundColor = String(avatar.background_color || '0xB69966');
    if (![zoomX, zoomY, positionX, positionY].every(Number.isFinite) || zoomX <= 0 || zoomY <= 0) {
      throw new Error('avatar_composite zoom and position values must be finite numbers; zoom must be positive.');
    }
    const scaledWidth = Math.round(Number(crop.width) * zoomX);
    const scaledHeight = Math.round(Number(crop.height) * zoomY);
    // Resolve-style offsets: negative Y moves the host down. Center the enlarged
    // crop first, then apply the requested offsets. This matches the approved still.
    const x = Math.round((info.width - scaledWidth) / 2 + positionX);
    const y = Math.round((info.height - scaledHeight) / 2 - positionY);
    filters.push(`color=c=${backgroundColor}:s=${info.width}x${info.height}:r=25:d=${info.duration},format=rgba[avatarbg]`);
    filters.push(`[0:v]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},despill=type=green:mix=${despillMix},scale=${scaledWidth}:${scaledHeight},format=yuva420p,colorchannelmixer=aa=1,chromakey=${keyColor}:${similarity}:${blend},format=yuva420p[avatarfg]`);
    filters.push(`[avatarbg][avatarfg]overlay=x=${x}:y=${y}:shortest=1:eof_action=pass,setsar=1[base]`);
  } else {
    filters.push(`[0:v]scale=${info.width}:${info.height}:force_original_aspect_ratio=decrease,pad=${info.width}:${info.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[base]`);
  }
  let current = 'base';
  placements.forEach((placement, index) => {
    const imageLabel = `img${index}`;
    const outputLabel = `v${index}`;
    const transitionDuration = Math.min(imageTransitionSeconds, placement.duration / 2);
    const zoomProgress = `min(1\\,on/(${placement.duration}*25))`;
    const zoomFilters = zoomStart !== zoomEnd
      ? `,zoompan=z='${zoomStart}+(${zoomEnd}-${zoomStart})*${zoomProgress}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${info.width}x${info.height}:fps=25`
      : `,fps=25,scale=${info.width}:${info.height}`;
    const initialCrop = `crop=${info.width}:${info.height}:x='(iw-ow)*${placement.focusX}':y='(ih-oh)*${placement.focusY}'`;
    // First crop the square source into the actual 9:16 canvas using its focal
    // position. Then zoompan crops around the center of that portrait canvas.
    // Its `on` frame counter advances reliably for looped still inputs.
    const sourceLabel = `imgSource${index}`;
    filters.push(`[${index + 1}:v]scale=${info.width}:${info.height}:force_original_aspect_ratio=increase,${initialCrop},setsar=1,format=rgba${zoomFilters},format=rgba,fps=25,trim=duration=${placement.duration},settb=AVTB,setpts=PTS-STARTPTS[${sourceLabel}]`);
    if (transitionDuration > 0 && placement.transitionEffect !== 'cut') {
      const blankLabel = `blank${index}`;
      filters.push(`color=c=black:s=${info.width}x${info.height}:r=25:d=${transitionDuration},format=rgba,colorchannelmixer=aa=0,settb=AVTB,setpts=PTS-STARTPTS[${blankLabel}]`);
      filters.push(`[${blankLabel}][${sourceLabel}]xfade=transition=${placement.transitionEffect}:duration=${transitionDuration}:offset=0,format=rgba,fade=t=out:st=${placement.duration - transitionDuration}:d=${transitionDuration}:alpha=1,setpts=PTS-STARTPTS+${placement.start}/TB[${imageLabel}]`);
    } else if (transitionDuration > 0) {
      filters.push(`[${sourceLabel}]fade=t=out:st=${placement.duration - transitionDuration}:d=${transitionDuration}:alpha=1,setpts=PTS-STARTPTS+${placement.start}/TB[${imageLabel}]`);
    } else {
      filters.push(`[${sourceLabel}]setpts=PTS-STARTPTS+${placement.start}/TB[${imageLabel}]`);
    }
    filters.push(`[${current}][${imageLabel}]overlay=0:0:eof_action=pass:shortest=0:enable='between(t,${placement.start},${placement.end})'[${outputLabel}]`);
    current = outputLabel;
  });

  // Burn captions after all B-roll overlays so they remain legible on top.
  let videoOutput = current;
  if (subtitleFile) {
    const subtitleOptions = [`filename='${filterPath(subtitleFile)}'`];
    if (subtitleFontsDir) subtitleOptions.push(`fontsdir='${filterPath(subtitleFontsDir)}'`);
    filters.push(`[${current}]subtitles=${subtitleOptions.join(':')}[captioned]`);
    videoOutput = 'captioned';
  }

  const audioInputs = ['[voice]'];
  filters.push('[0:a]aresample=async=1[voice]');
  if (musicIndex >= 0) {
    filters.push(`[${musicIndex}:a]volume=0.10,aresample=async=1[music]`);
    audioInputs.push('[music]');
  }
  if (transitionIndex >= 0) {
    placements.forEach((placement, index) => {
      const delay = Math.round(placement.start * 1000);
      const label = `sfx${index}`;
      filters.push(`[${transitionIndex}:a]atrim=0:0.60,asetpts=PTS-STARTPTS,volume=0.32,afade=t=in:st=0:d=0.03,afade=t=out:st=0.38:d=0.22,adelay=${delay}|${delay}[${label}]`);
      audioInputs.push(`[${label}]`);
    });
  }
  filters.push(`${audioInputs.join('')}amix=inputs=${audioInputs.length}:duration=first:dropout_transition=2:normalize=0[aout]`);
  ffmpegArgs.push('-filter_complex', filters.join(';'), '-map', `[${videoOutput}]`, '-map', '[aout]', '-t', String(info.duration), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output);

  console.log(`Rendering ${placements.length} B-roll placements${subtitleFile ? ' with burned-in subtitles' : ''} onto ${info.width}x${info.height} video...`);
  const result = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`ffmpeg failed with exit code ${result.status}`);
  console.log(`OUTPUT_VIDEO=${output}`);
}

try { main(); } catch (error) { console.error(error.stack || error.message || error); process.exit(1); }
