const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HEADERS = [
  'job_id', 'video_name', 'video_path', 'duration_seconds', 'render_status',
  'title', 'description', 'metadata_model', 'approval', 'publish_at',
  'instagram_status', 'instagram_post_id', 'instagram_published_at',
  'facebook_destination', 'facebook_status', 'facebook_post_id', 'facebook_published_at',
  'draft_created_at', 'last_error',
];

function cell(value) {
  let text = String(value ?? '').replace(/\r\n?|\n/g, ' ').trim();
  // The ledger is often opened in Excel; never let generated copy become a formula.
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeLedger(jobs, queueRoot, ledgerPath, root) {
  const byId = new Map(jobs.map(job => [job.id, job]));
  const files = fs.existsSync(queueRoot)
    ? fs.readdirSync(queueRoot).filter(name => name.endsWith('.json')).sort()
    : [];
  for (const file of files) {
    const id = file.slice(0, -5);
    if (!byId.has(id)) byId.set(id, { id, video: null });
  }

  const rows = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)).map(job => {
    const reviewPath = path.join(queueRoot, `${job.id}.json`);
    const draft = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath, 'utf8')) : null;
    const video = job.video || draft?.video_path || '';
    return {
      job_id: job.id,
      video_name: video ? path.basename(video) : '',
      video_path: video ? path.relative(root, video).replace(/\\/g, '/') : '',
      duration_seconds: draft?.duration_seconds ?? '',
      render_status: job.video ? 'done' : 'missing_video',
      title: draft?.title || '',
      description: draft?.description || '',
      metadata_model: draft?.metadata_model || '',
      approval: draft?.approval || 'draft_needed',
      publish_at: draft?.publish_at || '',
      instagram_status: draft?.instagram?.status || 'not_prepared',
      instagram_post_id: draft?.instagram?.post_id || '',
      instagram_published_at: draft?.instagram?.published_at || '',
      facebook_destination: draft?.facebook_destination || '',
      facebook_status: draft?.facebook?.status || 'not_prepared',
      facebook_post_id: draft?.facebook?.post_id || '',
      facebook_published_at: draft?.facebook?.published_at || '',
      draft_created_at: draft?.created_at || '',
      last_error: [draft?.instagram?.last_error, draft?.facebook?.last_error].filter(Boolean).join(' | '),
    };
  });

  const csv = [HEADERS.join(','), ...rows.map(row => HEADERS.map(key => cell(row[key])).join(','))].join('\r\n') + '\r\n';
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const temporary = `${ledgerPath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, '\uFEFF' + csv, 'utf8');
    fs.renameSync(temporary, ledgerPath);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { file: ledgerPath, rows: rows.length };
}

module.exports = { HEADERS, writeLedger };
