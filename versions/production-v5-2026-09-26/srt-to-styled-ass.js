#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function assTime(timestamp) {
  const match = timestamp.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) throw new Error(`Invalid SRT timestamp: ${timestamp}`);
  const totalCentiseconds = Math.round((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 100 + Number(match[4]) / 10);
  const hours = Math.floor(totalCentiseconds / 360000);
  const minutes = Math.floor((totalCentiseconds % 360000) / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function convertSrtToAss(srtText, styleTemplate) {
  let template = styleTemplate.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const styleMatch = template.match(/^Style: KhandAmber,[^\n]+/m);
  if (!styleMatch) throw new Error('Subtitle style template must contain the KhandAmber style.');
  const styleFields = styleMatch[0].split(',');
  const fontSize = Number(styleFields[2]) || 110;
  template = template.replace(styleMatch[0], styleFields.join(','));
  const header = template.slice(0, template.indexOf('[Events]')).trimEnd();
  const blocks = srtText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  const dialogue = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;
    const timing = lines[timingIndex].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if (!timing) throw new Error(`Invalid SRT cue timing: ${lines[timingIndex]}`);
    const start = assTime(timing[1]);
    const end = assTime(timing[2]);
    let text = lines.slice(timingIndex + 1).join('\\N').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (!text) continue;
    text = text.replace(/<i>/gi, '{\\i1}').replace(/<\/i>/gi, '{\\i0}')
      .replace(/<b>/gi, '{\\b1}').replace(/<\/b>/gi, '{\\b0}')
      .replace(/<u>/gi, '{\\u1}').replace(/<\/u>/gi, '{\\u0}');
    const fadeIn = dialogue.length === 0 ? 60 : 40;
    if (!text.includes('\\N') && text.length > 27) {
      const words = text.split(/\s+/);
      let splitAt = 1;
      let bestDifference = Infinity;
      for (let index = 1; index < words.length; index += 1) {
        const difference = Math.abs(words.slice(0, index).join(' ').length - words.slice(index).join(' ').length);
        if (difference < bestDifference) {
          bestDifference = difference;
          splitAt = index;
        }
      }
      const firstLine = words.slice(0, splitAt).join(' ');
      const secondLine = words.slice(splitAt).join(' ');
      dialogue.push(`Dialogue: 0,${start},${end},KhandAmber,,0,0,0,,{\\an5\\pos(540,1450)\\fs${fontSize}\\bord2.5\\fad(${fadeIn},40)}${firstLine}`);
      dialogue.push(`Dialogue: 0,${start},${end},KhandAmber,,0,0,0,,{\\an5\\pos(540,1555)\\fs${fontSize}\\bord2.5\\fad(${fadeIn},40)}${secondLine}`);
    } else {
      dialogue.push(`Dialogue: 0,${start},${end},KhandAmber,,0,0,0,,{\\fad(${fadeIn},40)}${text}`);
    }
  }
  if (!dialogue.length) throw new Error('No subtitle cues were found in the SRT file.');
  return `${header}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${dialogue.join('\n')}\n`;
}

module.exports = { convertSrtToAss };

if (require.main === module) {
  const srtPath = process.argv[2] || path.join(__dirname, 'Timeline 1 (1).srt');
  const stylePath = process.argv[3] || path.join(__dirname, 'ayurveda-subtitles-khand-bold-amber.ass');
  const outputPath = process.argv[4] || path.join(__dirname, 'ayurveda-subtitles-khand-bold-amber.ass');
  fs.writeFileSync(outputPath, convertSrtToAss(fs.readFileSync(srtPath, 'utf8'), fs.readFileSync(stylePath, 'utf8')), 'utf8');
  console.log(`Wrote ${outputPath}`);
}
