const fs = require('fs');

function graphBase(version) {
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('META_GRAPH_VERSION must look like v26.0.');
  return `https://graph.facebook.com/${version}`;
}

function graphId(value, label) {
  if (!/^\d+$/.test(String(value || ''))) throw new Error(`${label} must be a numeric Meta ID.`);
  return String(value);
}

function errorText(payload, status) {
  const error = payload?.error;
  return `Meta HTTP ${status}: ${error?.message || payload?.message || 'Request failed'}${error?.code ? ` (code ${error.code})` : ''}`;
}

async function jsonRequest(url, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs || 120000) });
  const body = await response.text();
  let payload;
  try { payload = body ? JSON.parse(body) : {}; } catch { payload = { message: body.slice(0, 300) }; }
  if (!response.ok || payload?.error || payload?.success === false) throw new Error(errorText(payload, response.status));
  return payload;
}

function formRequest(base, edge, token, fields, fetchImpl) {
  return jsonRequest(`${base}/${edge}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  }, fetchImpl);
}

function validateUploadUri(uri) {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'rupload.facebook.com') {
    throw new Error('Meta returned an unexpected upload address.');
  }
  return parsed.href;
}

async function uploadVideo(uri, videoPath, token, fetchImpl) {
  const stat = fs.statSync(videoPath);
  const stream = fs.createReadStream(videoPath);
  try {
    return await jsonRequest(validateUploadUri(uri), {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        offset: '0',
        file_size: String(stat.size),
        'content-type': 'application/octet-stream',
      },
      body: stream,
      duplex: 'half',
      timeoutMs: 600000,
    }, fetchImpl);
  } finally {
    stream.destroy();
  }
}

function makeMetaClient(config, fetchImpl = fetch) {
  const base = graphBase(config.version || 'v26.0');
  const pageId = graphId(config.pageId, 'META_PAGE_ID');
  const igId = graphId(config.igId, 'META_IG_USER_ID');
  const token = config.token;
  if (!token) throw new Error('META_PAGE_ACCESS_TOKEN is missing.');

  async function checkFacebookStatus(state, save) {
    const id = graphId(state.post_id || state.video_id, 'Facebook video ID');
    const result = await jsonRequest(`${base}/${id}?fields=status`, {
      headers: { Authorization: `Bearer ${token}` },
    }, fetchImpl);
    if (result.status?.video_status === 'error') {
      throw new Error(`Facebook video processing failed for ${id}. Inspect its Meta status before retrying.`);
    }
    if (result.status?.publishing_phase?.status === 'complete') {
      state.status = 'published';
      state.published_at = new Date().toISOString();
      save();
    }
  }

  return {
    async instagram(job, save) {
      const state = job.instagram;
      if (state.status === 'published' || state.status === 'needs_review') return;
      if (state.status === 'pending') {
        const created = await formRequest(base, `${igId}/media`, token, {
          media_type: 'REELS', upload_type: 'resumable',
          caption: `${job.title}\n\n${job.description}`,
          share_to_feed: 'true',
        }, fetchImpl);
        if (!created.id || !created.uri) throw new Error('Instagram did not return a container ID and upload URI.');
        state.container_id = created.id;
        state.upload_uri = validateUploadUri(created.uri);
        state.status = 'container_created';
        save();
      }
      if (state.status === 'container_created') {
        await uploadVideo(state.upload_uri, job.video_path, token, fetchImpl);
        state.status = 'uploaded';
        save();
      }
      if (state.status === 'uploaded') {
        const status = await jsonRequest(`${base}/${graphId(state.container_id, 'Instagram container ID')}?fields=status_code,status`, {
          headers: { Authorization: `Bearer ${token}` },
        }, fetchImpl);
        if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
          throw new Error(`Instagram processing ${status.status_code}: ${String(status.status || '').slice(0, 250)}`);
        }
        if (status.status_code !== 'FINISHED') return;
        state.status = 'ready';
        save();
      }
      if (state.status === 'ready') {
        state.status = 'publishing'; // Never resend a possibly accepted publish request automatically.
        save();
        const published = await formRequest(base, `${igId}/media_publish`, token, {
          creation_id: state.container_id,
        }, fetchImpl);
        if (!published.id) throw new Error('Instagram returned no published media ID.');
        state.post_id = published.id;
        state.status = 'published';
        state.published_at = new Date().toISOString();
        save();
      }
    },

    async facebook(job, save) {
      const state = job.facebook;
      if (state.status === 'published' || state.status === 'needs_review') return;
      if (state.status === 'processing') return checkFacebookStatus(state, save);
      if (state.format === 'page_video') {
        if (state.status !== 'pending') return;
        state.status = 'publishing'; // A failed response may still have created a post.
        save();
        const form = new FormData();
        form.append('source', new Blob([fs.readFileSync(job.video_path)], { type: 'video/mp4' }), 'video.mp4');
        form.append('title', job.title);
        form.append('description', job.description);
        form.append('published', 'true');
        const published = await jsonRequest(`${base}/${pageId}/videos`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
          timeoutMs: 600000,
        }, fetchImpl);
        if (!published.id) throw new Error('Facebook returned no video ID.');
        state.post_id = published.id;
        state.status = 'processing';
        save();
        return checkFacebookStatus(state, save);
      }
      if (state.status === 'pending') {
        const created = await formRequest(base, `${pageId}/video_reels`, token, {
          upload_phase: 'start',
        }, fetchImpl);
        if (!created.video_id) throw new Error('Facebook did not return a Reel video ID.');
        state.video_id = created.video_id;
        state.upload_uri = validateUploadUri(created.upload_url || `https://rupload.facebook.com/video-upload/${config.version || 'v26.0'}/${created.video_id}`);
        state.status = 'container_created';
        save();
      }
      if (state.status === 'container_created') {
        await uploadVideo(state.upload_uri, job.video_path, token, fetchImpl);
        state.status = 'uploaded';
        save();
      }
      if (state.status === 'uploaded') {
        state.status = 'publishing';
        save();
        await formRequest(base, `${pageId}/video_reels`, token, {
          upload_phase: 'finish', video_id: state.video_id,
          video_state: 'PUBLISHED', title: job.title, description: job.description,
        }, fetchImpl);
        state.post_id = state.video_id;
        state.status = 'processing';
        save();
        return checkFacebookStatus(state, save);
      }
    },
  };
}

module.exports = { makeMetaClient, graphBase, graphId, validateUploadUri };
