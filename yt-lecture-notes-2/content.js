// content.js - Runs on YouTube watch pages

// Inject responsive CSS so YouTube layout adapts to side panel resizing
const style = document.createElement('style');
style.id = 'yt-notes-layout-fix';
style.textContent = `
  /* Make the page fluid so it adapts when side panel resizes */
  ytd-watch-flexy[flexy][is-two-columns_] #primary.ytd-watch-flexy,
  ytd-watch-flexy #primary.ytd-watch-flexy {
    min-width: 0 !important;
    width: 100% !important;
  }

  ytd-watch-flexy[flexy] #secondary.ytd-watch-flexy {
    min-width: 0 !important;
  }

  /* Prevent the video from overflowing its container */
  #movie_player,
  .html5-video-container,
  video.html5-main-video {
    max-width: 100% !important;
  }

  /* Stop horizontal scrollbar appearing */
  ytd-app {
    overflow-x: hidden !important;
  }

  /* Keep the page from breaking at narrow widths */
  ytd-watch-flexy[flexy][hide-secondary-column_] #primary.ytd-watch-flexy {
    max-width: 100% !important;
  }
`;
document.documentElement.appendChild(style);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_VIDEO_INFO") {
    const video = document.querySelector('video');
    const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string')
                 || document.querySelector('#title h1')
                 || document.querySelector('h1.title');
    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(' - YouTube', '');

    const playlistId = new URLSearchParams(window.location.search).get('list');
    let playlistTitle = null;
    const playlistTitleEl = document.querySelector('#playlist-name')
                          || document.querySelector('ytd-playlist-panel-renderer #title');
    if (playlistTitleEl) playlistTitle = playlistTitleEl.textContent.trim();

    sendResponse({
      time: video ? video.currentTime : 0,
      title: title,
      url: window.location.href,
      videoId: new URLSearchParams(window.location.search).get('v'),
      playlistId: playlistId,
      playlistTitle: playlistTitle,
      thumbnail: `https://img.youtube.com/vi/${new URLSearchParams(window.location.search).get('v')}/mqdefault.jpg`
    });
  }

  if (request.action === "SEEK_TO_TIME") {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = request.time;
      video.play();
    }
    sendResponse({ success: true });
  }

  return true;
});

// Inject a subtle "Notes" indicator badge on the YT page if notes exist
function injectNotesBadge() {
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) return;

  chrome.storage.local.get([`notes_${videoId}`], (result) => {
    if (!result[`notes_${videoId}`]) return;
    const noteData = result[`notes_${videoId}`];
    if (!noteData.content || noteData.content.ops?.length <= 1) return;

    const existing = document.getElementById('yt-notes-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'yt-notes-badge';
    badge.innerHTML = `
      <div style="
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: linear-gradient(135deg, #c00 0%, #800 100%);
        color: white;
        padding: 10px 16px;
        border-radius: 24px;
        font-family: 'Segoe UI', sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        z-index: 9999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.2s;
        letter-spacing: 0.3px;
      " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'"
         title="You have notes for this video - click the extension to view them">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        Notes available
      </div>
    `;
    document.body.appendChild(badge);
  });
}

setTimeout(injectNotesBadge, 2000);