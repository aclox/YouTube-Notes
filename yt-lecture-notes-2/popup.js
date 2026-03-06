// popup.js - Main extension logic

// ─── State ───────────────────────────────────────────────────────────────────
let currentVideoId = null;
let currentVideoUrl = null;
let currentPlaylistId = null;
let saveTimer = null;
let quill = null;

// ─── Init Quill ──────────────────────────────────────────────────────────────
quill = new Quill('#editor', {
  theme: 'snow',
  placeholder: 'Start taking notes... Use the Timestamp button to link to a video moment.',
  modules: {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['blockquote', 'code-block'],
      ['link'],
      ['clean']
    ]
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
// Single safe entry point - always wait for DOMContentLoaded
document.addEventListener('DOMContentLoaded', detectContext);

// ─── Detect if we're on YouTube ──────────────────────────────────────────────
function detectContext() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Tab query error:', chrome.runtime.lastError);
      showNotYouTubeUI();
      return;
    }
    if (!tabs || tabs.length === 0) {
      showNotYouTubeUI();
      return;
    }

    const tab = tabs[0];
    // tab.url may be empty if host_permissions not granted yet;
    // fall back to tab.pendingUrl as well
    const url = tab.url || tab.pendingUrl || '';

    console.log('[YT Notes] Active tab URL:', url); // debug

    if (url.includes('youtube.com/watch')) {
      showEditorUI();
      fetchVideoInfo(tab);
    } else {
      showNotYouTubeUI();
    }
  });
}

function showEditorUI() {
  document.getElementById('editor-area').style.display = 'flex';
  document.getElementById('not-youtube').style.display = 'none';
}

function showNotYouTubeUI() {
  document.getElementById('editor-area').style.display = 'none';
  document.getElementById('not-youtube').style.display = 'flex';
  document.getElementById('video-title').textContent = 'Not on YouTube';
  document.getElementById('video-sub').textContent = 'Open a YouTube video to begin';
}

// ─── Fetch video info from content script ────────────────────────────────────
function fetchVideoInfo(tab) {
  // Always extract videoId directly from URL — don't depend solely on content script
  const url = tab.url || '';
  const videoId = new URL(url).searchParams.get('v');
  const playlistId = new URL(url).searchParams.get('list');

  if (!videoId) {
    showNotYouTubeUI();
    return;
  }

  // Show the editor immediately with what we know from the URL
  const fallbackInfo = {
    videoId,
    url,
    playlistId,
    title: tab.title ? tab.title.replace(' - YouTube', '').trim() : 'YouTube Video',
    thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    playlistTitle: null,
    time: 0
  };
  setupEditor(fallbackInfo, tab);

  // Then try to enrich with content script data (video title, exact playlist name)
  chrome.tabs.sendMessage(tab.id, { action: 'GET_VIDEO_INFO' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      // Content script not ready — inject it then retry once
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ['content.js'] },
        () => {
          if (chrome.runtime.lastError) return; // page may not allow injection
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'GET_VIDEO_INFO' }, (res) => {
              if (res) setupEditor(res, tab);
            });
          }, 600);
        }
      );
      return;
    }
    // Update with richer data from page
    setupEditor(response, tab);
  });
}

// ─── Setup editor with video data ────────────────────────────────────────────
function setupEditor(info, tab) {
  const isFirstLoad = currentVideoId !== info.videoId;
  currentVideoId = info.videoId;
  currentVideoUrl = info.url;
  currentPlaylistId = info.playlistId;

  // Update meta bar
  document.getElementById('video-title').textContent = info.title || 'Untitled Video';
  document.getElementById('video-sub').textContent = `youtube.com/watch?v=${currentVideoId}`;

  // Set thumbnail
  const thumbImg = document.getElementById('video-thumb-img');
  if (thumbImg && info.thumbnail) thumbImg.src = info.thumbnail;

  // Show play button
  const goBtn = document.getElementById('go-video-btn');
  if (goBtn) goBtn.style.display = 'flex';

  // Show playlist bar if in a playlist
  if (currentPlaylistId) {
    document.getElementById('playlist-bar').style.display = 'flex';
    document.getElementById('playlist-name-text').textContent =
      info.playlistTitle ? `Playlist: ${info.playlistTitle}` : 'Part of a playlist';
  }

  // Only load from storage on the first load for this video
  if (isFirstLoad) {
    const storageKey = `notes_${currentVideoId}`;
    chrome.storage.local.get([storageKey], (result) => {
      if (result[storageKey]) {
        const saved = result[storageKey];
        quill.setContents(saved.content || saved);
      }
      setStatus('saved', 'All saved');
    });
  }

  // Save video metadata for library
  saveVideoMeta(info);
}

// ─── Save video metadata to the library ──────────────────────────────────────
function saveVideoMeta(info) {
  if (!info.videoId) return;
  chrome.storage.local.get(['video_library'], (result) => {
    const library = result.video_library || {};
    library[info.videoId] = {
      videoId: info.videoId,
      title: info.title,
      url: info.url,
      thumbnail: info.thumbnail,
      playlistId: info.playlistId,
      playlistTitle: info.playlistTitle,
      lastAccessed: Date.now()
    };
    chrome.storage.local.set({ video_library: library });
  });
}

// ─── Auto-save ────────────────────────────────────────────────────────────────
quill.on('text-change', () => {
  if (!currentVideoId) return;
  setStatus('saving', 'Saving...');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNotes, 800);
});

function saveNotes() {
  if (!currentVideoId) return;
  const storageKey = `notes_${currentVideoId}`;
  const data = {
    content: quill.getContents(),
    html: quill.root.innerHTML,
    videoId: currentVideoId,
    videoUrl: currentVideoUrl,
    playlistId: currentPlaylistId,
    savedAt: Date.now()
  };
  chrome.storage.local.set({ [storageKey]: data }, () => {
    setStatus('saved', 'Saved');
    setTimeout(() => setStatus('', 'Ready'), 2000);
  });
}

// ─── Status display ───────────────────────────────────────────────────────────
function setStatus(state, text) {
  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  dot.className = `status-dot ${state}`;
  statusText.textContent = text;
}

// ─── Timestamp insertion ──────────────────────────────────────────────────────
document.getElementById('timestamp-btn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_VIDEO_INFO' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        insertTimestamp(0, null);
        return;
      }
      insertTimestamp(response.time, currentVideoUrl);
    });
  });
});

function insertTimestamp(seconds, videoUrl) {
  const totalSec = Math.floor(seconds);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  let label;
  if (h > 0) {
    label = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  } else {
    label = `${m}:${String(s).padStart(2, '0')}`;
  }

  const range = quill.getSelection(true);
  const index = range ? range.index : quill.getLength();

  // Insert formatted timestamp
  quill.insertText(index, `[${label}] `, {
    bold: true,
    color: '#ff4444',
    link: videoUrl ? `${videoUrl}&t=${totalSec}s` : null
  });

  // Move cursor after timestamp
  quill.setSelection(index + label.length + 3);
  quill.focus();
}

// ─── Export ───────────────────────────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', () => {
  const title = document.getElementById('video-title').textContent || 'Notes';
  const content = quill.root.innerHTML;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #222; line-height: 1.7; }
  h1 { color: #111; } h2 { color: #333; }
  blockquote { border-left: 3px solid #c00; padding-left: 12px; color: #666; }
  a { color: #c00; }
  .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
  .header h2 { margin: 0 0 6px 0; }
  .header p { margin: 0; color: #888; font-size: 13px; }
</style>
</head>
<body>
<div class="header">
  <h2>${title}</h2>
  <p>Video: <a href="${currentVideoUrl || '#'}">${currentVideoUrl || 'N/A'}</a></p>
  <p>Exported: ${new Date().toLocaleString()}</p>
</div>
${content}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}_Notes.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ─── Library button ───────────────────────────────────────────────────────────
document.getElementById('library-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('notes-manager.html') });
});

document.getElementById('open-library-btn')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('notes-manager.html') });
});

// ─── Go to video button ───────────────────────────────────────────────────────
document.getElementById('go-video-btn').addEventListener('click', () => {
  if (currentVideoUrl) {
    chrome.tabs.create({ url: currentVideoUrl });
  }
});

// ─── View compiled playlist notes ─────────────────────────────────────────────
document.getElementById('view-playlist-btn')?.addEventListener('click', () => {
  if (currentPlaylistId) {
    chrome.tabs.create({
      url: chrome.runtime.getURL(`notes-manager.html?playlist=${currentPlaylistId}`)
    });
  }
});
