'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const links = require('./envato-links');

const beat = (n, terms, extra = {}) => ({ n, time: `0:0${n}.0-0:0${n + 3}.0`, spoken: 'हिंदी', english: terms[0], search_terms: terms,
  envato_search: links.envatoSearch(terms), min_clip_seconds: 5, ...extra });

test('Envato Elements search links use short keywords and the vertical filter', () => {
  const search = links.envatoSearch(['person injecting insulin with a pen', 'person injecting insulin pen']);
  assert.equal(search.slug, 'person-injecting-insulin-pen');
  assert.equal(search.vertical, 'https://elements.envato.com/stock-video/person-injecting-insulin-pen/orientation-vertical');
  assert.equal(search.any, 'https://elements.envato.com/stock-video/person-injecting-insulin-pen');
  assert.equal(links.envatoSlug("Doctor's  Clinic & Desk!"), 'doctor-s-clinic-desk');
  assert.equal(links.envatoSearch([]), null);
});

test('the double-click file opens only safe Envato links and starts the collector', () => {
  const list = { beats: [beat(1, ['insulin pen injection', 'insulin pen']), beat(2, ['donuts on a plate', 'donuts plate'])] };
  const cmd = links.openerCmd(list, '..\\..\\Collect-Envato-Downloads.ps1');
  assert.match(cmd, /^@echo off\r\n/);
  assert.match(cmd, /call :open "https:\/\/elements\.envato\.com\/stock-video\/insulin-pen\/orientation-vertical"\r\n/);
  assert.match(cmd, /call :open "https:\/\/elements\.envato\.com\/stock-video\/donuts-plate\/orientation-vertical"\r\n/);
  assert.match(cmd, /powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0\.\.\\\.\.\\Collect-Envato-Downloads\.ps1" -Inbox "%~dp0\."/);
  assert.doesNotMatch(cmd.replace(/%~dp0|%~1|%BROWSER%/g, ''), /%|&(?!&)/, 'no stray % or & that cmd.exe would interpret');
  const unsafe = { beats: [{ n: 1, envato_search: { vertical: 'https://example.com/x&calc' } }] };
  assert.throws(() => links.openerCmd(unsafe, null), /Unsafe Envato URL refused/);
  assert.match(links.openerCmd(list, null), /pause/, 'without a collector it asks the user to move files');
});

test('the collector path is relative to the inbox and only used inside the project', () => {
  const root = path.resolve('/files/heygen-workflow');
  assert.equal(links.collectorRelativePath(path.join(root, 'broll-inbox', 'video-1'), root), '..\\..\\Collect-Envato-Downloads.ps1');
  assert.equal(links.collectorRelativePath(path.resolve('/elsewhere/inbox/video-1'), root), null);
});

test('the links page escapes text and lists vertical and all-orientation links', () => {
  const html = links.linksHtml({ video: '<b>reel</b>.mp4', required: true, beats: [beat(1, ['insulin pen <script>', 'insulin pen'])] });
  assert.match(html, /&lt;b&gt;reel&lt;\/b&gt;\.mp4/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /href="https:\/\/elements\.envato\.com\/stock-video\/insulin-pen\/orientation-vertical"/);
  assert.match(html, /Open-Envato-Links\.cmd/);
});

test('the collector gets each moment with its slug and match words', () => {
  const moments = links.momentsForCollector({ beats: [beat(3, ['hands preparing an insulin pen injection', 'hands preparing insulin pen'])] });
  assert.equal(moments[0].n, 3);
  assert.equal(moments[0].slug, 'hands-preparing-insulin-pen');
  assert.ok(moments[0].words.includes('insulin') && moments[0].words.includes('pen') && !moments[0].words.includes('an'));
});
