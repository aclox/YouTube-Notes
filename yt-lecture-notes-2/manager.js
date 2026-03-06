// manager.js - Notes Library Page

let allNotes = {};
let videoLibrary = {};
let currentTab = 'videos';
let currentVideoId = null;
let currentPlaylistId = null;

// Check URL params for direct playlist view
const urlParams = new URLSearchParams(window.location.search);
const targetPlaylist = urlParams.get('playlist');

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  setupTabs();
  setupSearch();
});

// ─── Load all data ────────────────────────────────────────────────────────────
function loadAllData() {
  chrome.storage.local.get(null, (allData) => {
    videoLibrary = allData.video_library || {};
    allNotes = {};

    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith('notes_')) {
        const videoId = key.replace('notes_', '');
        // Only include if there's actual content
        if (value && value.content) {
          allNotes[videoId] = value;
        }
      }
    }

    renderList();

    // Auto-open playlist view if requested via URL param
    if (targetPlaylist) {
      setTimeout(() => showPlaylistView(targetPlaylist), 100);
    }
  });
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      renderList();
    });
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────
function setupSearch() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    renderList(e.target.value.toLowerCase());
  });
}

// ─── Render sidebar list ──────────────────────────────────────────────────────
function renderList(query = '') {
  const list = document.getElementById('note-list');

  const videoIds = Object.keys(allNotes);
  if (videoIds.length === 0) {
    list.innerHTML = '<div class="empty-list">No notes yet. Go watch a YouTube lecture and take some notes!</div>';
    return;
  }

  if (currentTab === 'videos') {
    renderVideoList(list, videoIds, query);
  } else {
    renderPlaylistList(list, videoIds, query);
  }
}

function renderVideoList(list, videoIds, query) {
  // Sort by last accessed
  const sorted = videoIds.sort((a, b) => {
    const metaA = videoLibrary[a];
    const metaB = videoLibrary[b];
    return (metaB?.lastAccessed || 0) - (metaA?.lastAccessed || 0);
  });

  const filtered = sorted.filter(id => {
    if (!query) return true;
    const meta = videoLibrary[id];
    return (meta?.title || '').toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-list">No results found.</div>';
    return;
  }

  list.innerHTML = filtered.map(videoId => {
    const meta = videoLibrary[videoId] || {};
    const note = allNotes[videoId];
    const date = note?.savedAt ? new Date(note.savedAt).toLocaleDateString() : '';
    const title = meta.title || `Video ${videoId}`;
    const thumb = meta.thumbnail || '';

    return `<div class="note-item ${videoId === currentVideoId ? 'active' : ''}" data-video-id="${videoId}">
      <img class="note-item-thumb" src="${thumb}" alt="" onerror="this.style.display='none'">
      <div class="note-item-info">
        <div class="note-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
        <div class="note-item-meta">${date}</div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.videoId;
      openNote(id);
    });
  });
}

function renderPlaylistList(list, videoIds, query) {
  // Group by playlist
  const playlists = {};
  const noPlaylist = [];

  videoIds.forEach(id => {
    const meta = videoLibrary[id];
    if (meta?.playlistId) {
      if (!playlists[meta.playlistId]) {
        playlists[meta.playlistId] = {
          title: meta.playlistTitle || `Playlist ${meta.playlistId}`,
          videos: []
        };
      }
      if (!query || (meta.title || '').toLowerCase().includes(query)) {
        playlists[meta.playlistId].videos.push(id);
      }
    } else {
      if (!query || (meta?.title || '').toLowerCase().includes(query)) {
        noPlaylist.push(id);
      }
    }
  });

  let html = '';

  for (const [playlistId, data] of Object.entries(playlists)) {
    if (data.videos.length === 0) continue;
    html += `<div class="playlist-group">
      <div class="playlist-group-header">
        <span>${escapeHtml(data.title)}</span>
        <button class="view-compiled-btn" data-playlist="${playlistId}">View Compiled</button>
      </div>
      ${data.videos.map(id => renderNoteItemHTML(id)).join('')}
    </div>`;
  }

  if (noPlaylist.length > 0) {
    html += `<div class="playlist-group">
      <div class="playlist-group-header"><span>No Playlist</span></div>
      ${noPlaylist.map(id => renderNoteItemHTML(id)).join('')}
    </div>`;
  }

  if (!html) {
    list.innerHTML = '<div class="empty-list">No playlist notes found.</div>';
    return;
  }

  list.innerHTML = html;

  list.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('click', () => openNote(item.dataset.videoId));
  });

  list.querySelectorAll('.view-compiled-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showPlaylistView(btn.dataset.playlist);
    });
  });
}

function renderNoteItemHTML(videoId) {
  const meta = videoLibrary[videoId] || {};
  const note = allNotes[videoId];
  const date = note?.savedAt ? new Date(note.savedAt).toLocaleDateString() : '';
  const title = meta.title || `Video ${videoId}`;
  const thumb = meta.thumbnail || '';
  return `<div class="note-item ${videoId === currentVideoId ? 'active' : ''}" data-video-id="${videoId}">
    <img class="note-item-thumb" src="${thumb}" alt="" onerror="this.style.display='none'">
    <div class="note-item-info">
      <div class="note-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
      <div class="note-item-meta">${date}</div>
    </div>
  </div>`;
}

// ─── Open a note ──────────────────────────────────────────────────────────────
function openNote(videoId) {
  currentVideoId = videoId;
  const meta = videoLibrary[videoId] || {};
  const note = allNotes[videoId];

  // Update active state in list
  document.querySelectorAll('.note-item').forEach(i => i.classList.remove('active'));
  const activeItem = document.querySelector(`[data-video-id="${videoId}"]`);
  if (activeItem) activeItem.classList.add('active');

  // Hide other panels
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('playlist-view').style.display = 'none';
  document.getElementById('note-view').style.display = 'flex';

  // Populate
  document.getElementById('note-view-title').textContent = meta.title || `Video ${videoId}`;
  document.getElementById('note-thumb').src = meta.thumbnail || '';

  const savedDate = note?.savedAt ? new Date(note.savedAt).toLocaleString() : 'Unknown';
  document.getElementById('note-view-sub').innerHTML = `
    Last saved: ${savedDate} &nbsp;·&nbsp;
    <a href="${escapeHtml(meta.url || '#')}" target="_blank">Open on YouTube ↗</a>
    ${meta.playlistTitle ? `&nbsp;·&nbsp; Playlist: ${escapeHtml(meta.playlistTitle)}` : ''}
  `;

  // Render note HTML
  if (note?.html) {
    document.getElementById('note-content').innerHTML = note.html;
  } else {
    document.getElementById('note-content').innerHTML = '<em style="color:#555">No content yet.</em>';
  }

  // Timestamp links: make them open YouTube at the right time
  document.querySelectorAll('#note-content a').forEach(link => {
    const href = link.href || '';
    if (href.includes('youtube.com/watch') && href.includes('&t=')) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: href });
      });
    }
  });

  // Setup action buttons
  document.getElementById('open-video-btn').onclick = () => {
    if (meta.url) chrome.tabs.create({ url: meta.url });
  };

  document.getElementById('export-note-btn').onclick = () => {
    exportNote(videoId, meta, note);
  };

  document.getElementById('delete-note-btn').onclick = () => {
    deleteNote(videoId);
  };
}

// ─── Playlist compiled view ───────────────────────────────────────────────────
function showPlaylistView(playlistId) {
  currentPlaylistId = playlistId;

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('note-view').style.display = 'none';
  document.getElementById('playlist-view').style.display = 'flex';

  // Get all videos in this playlist
  const playlistVideos = Object.entries(videoLibrary)
    .filter(([id, meta]) => meta.playlistId === playlistId)
    .sort((a, b) => (a[1].lastAccessed || 0) - (b[1].lastAccessed || 0));

  const playlistTitle = playlistVideos[0]?.[1]?.playlistTitle || `Playlist ${playlistId}`;
  document.getElementById('playlist-view-title').textContent = playlistTitle;
  document.getElementById('playlist-view-sub').textContent =
    `${playlistVideos.length} video${playlistVideos.length !== 1 ? 's' : ''} with notes`;

  const container = document.getElementById('playlist-notes');

  if (playlistVideos.length === 0) {
    container.innerHTML = '<div style="color:#555;padding:20px;text-align:center">No notes found for this playlist.</div>';
    return;
  }

  container.innerHTML = playlistVideos.map(([videoId, meta]) => {
    const note = allNotes[videoId];
    if (!note) return '';

    const savedDate = note.savedAt ? new Date(note.savedAt).toLocaleDateString() : '';
    const contentHtml = note.html || '<em style="color:#555">Empty notes</em>';

    return `<div class="playlist-note-section">
      <div class="playlist-note-section-header">
        <img src="${meta.thumbnail || ''}" alt="" onerror="this.style.display='none'">
        <div>
          <div class="psection-title">${escapeHtml(meta.title || videoId)}</div>
          <div class="psection-meta">
            ${savedDate} &nbsp;·&nbsp;
            <a href="${escapeHtml(meta.url || '#')}" target="_blank">Open video ↗</a>
          </div>
        </div>
      </div>
      <div class="playlist-note-section-content">${contentHtml}</div>
    </div>`;
  }).join('');

  // Export all button
  document.getElementById('export-playlist-btn').onclick = () => {
    exportPlaylist(playlistId, playlistTitle, playlistVideos);
  };
}

// ─── Delete note ──────────────────────────────────────────────────────────────
function deleteNote(videoId) {
  if (!confirm('Delete notes for this video? This cannot be undone.')) return;

  const storageKey = `notes_${videoId}`;
  chrome.storage.local.remove([storageKey], () => {
    delete allNotes[videoId];

    // Show empty state
    document.getElementById('note-view').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
    currentVideoId = null;

    renderList(document.getElementById('search-input').value.toLowerCase());
  });
}

// ─── Export a single note ─────────────────────────────────────────────────────
function exportNote(videoId, meta, note) {
  const title = meta.title || `Video ${videoId}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #222; line-height: 1.7; }
  h1 { color: #111; } h2 { color: #333; } h3 { color: #444; }
  blockquote { border-left: 3px solid #c00; padding-left: 12px; color: #666; margin: 12px 0; }
  a { color: #c00; }
  code { background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  pre { background: #f5f5f5; padding: 14px; border-radius: 6px; overflow-x: auto; }
  .header { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 28px; border: 1px solid #eee; }
  .header h2 { margin: 0 0 8px; font-size: 18px; }
  .header p { margin: 0; color: #888; font-size: 13px; }
</style>
</head>
<body>
<div class="header">
  <h2>${escapeHtml(title)}</h2>
  <p>Video: <a href="${escapeHtml(meta.url || '#')}">${escapeHtml(meta.url || 'N/A')}</a></p>
  <p>Exported: ${new Date().toLocaleString()}</p>
</div>
${note?.html || ''}
</body>
</html>`;

  downloadHTML(html, `${title.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}_Notes.html`);
}

// ─── Export playlist ──────────────────────────────────────────────────────────
function exportPlaylist(playlistId, playlistTitle, videos) {
  let sections = '';
  videos.forEach(([videoId, meta]) => {
    const note = allNotes[videoId];
    if (!note) return;
    sections += `
    <div class="video-section">
      <h2>${escapeHtml(meta.title || videoId)}</h2>
      <p class="video-link"><a href="${escapeHtml(meta.url || '#')}">Watch on YouTube ↗</a></p>
      <div class="video-notes">${note.html || ''}</div>
    </div>
    <hr>`;
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(playlistTitle)} – Compiled Notes</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; max-width: 860px; margin: 40px auto; padding: 0 24px; color: #222; line-height: 1.7; }
  h1 { color: #111; border-bottom: 2px solid #c00; padding-bottom: 12px; margin-bottom: 28px; }
  h2 { color: #111; font-size: 20px; margin: 0 0 6px; }
  h3 { color: #333; }
  blockquote { border-left: 3px solid #c00; padding-left: 14px; color: #666; }
  a { color: #c00; }
  hr { border: none; border-top: 1px solid #eee; margin: 32px 0; }
  .video-section { margin-bottom: 20px; }
  .video-link { color: #888; font-size: 13px; margin-bottom: 16px; }
  .video-notes { margin-top: 12px; }
  .header-meta { color: #888; font-size: 13px; margin-bottom: 30px; }
  code { background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f5f5f5; padding: 14px; border-radius: 6px; }
</style>
</head>
<body>
<h1>${escapeHtml(playlistTitle)}</h1>
<p class="header-meta">Compiled notes from ${videos.length} video${videos.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Exported ${new Date().toLocaleString()}</p>
${sections}
</body>
</html>`;

  downloadHTML(html, `${playlistTitle.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}_Playlist_Notes.html`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function downloadHTML(html, filename) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
