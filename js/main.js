// Durga Pujo Nostalgia - Playlist + Puja utilities

// ============================================================
// YOUTUBE PLAYLIST SETTINGS
// Paste either the Playlist ID OR the full YouTube playlist link.
// ============================================================
const playlists = {
    'mahalaya':  { type: 'playlist', listId: 'https://www.youtube.com/watch?v=YQyo8QeoYhc&list=PLeLE8pKcP7n4' },
    'pujo-prem': { type: 'playlist', listId: 'https://www.youtube.com/watch?v=qAvT2OcMdnk&list=PLCAvTbKC1xSc' },
    'pujo-radio':{ type: 'playlist', listId: 'https://www.youtube.com/watch?v=fpuadv59iYw&list=PLDCeflCIhWgs' }
};

// Kolkata Puja list used for the QR code + clickable link.
const kolkataPujoListUrl = 'https://kolkatakhoj.com/pandals/';

let currentPlaylistKey = 'pujo-radio';
let isPlaying = false;
let player = null;
let progressInterval = null;
let currentPlaylistItems = [];

function normalizePlaylistId(value) {
    if (!value) return '';
    const text = String(value).trim();
    if (!text || text.startsWith('YOUR_')) return '';

    // Accept a plain playlist ID.
    if (!text.includes('youtube.com') && !text.includes('youtu.be')) return text;

    try {
        const url = new URL(text);
        return url.searchParams.get('list') || '';
    } catch (e) {
        const match = text.match(/[?&]list=([^&]+)/);
        return match ? match[1] : '';
    }
}

function getConfiguredPlaylistId() {
    return normalizePlaylistId(playlists[currentPlaylistKey]?.listId);
}

function getConfiguredVideoId() {
    const value = playlists[currentPlaylistKey]?.listId || '';
    const text = String(value).trim();

    // If a full YouTube URL is supplied, use its video= parameter as a
    // guaranteed fallback. This lets the first song play even if YouTube
    // delays/rejects exposing the playlist through getPlaylist().
    const match = text.match(/[?&]v=([^&]+)/);
    return match ? match[1] : '';
}

function onYouTubeIframeAPIReady() {
    player = new YT.Player('youtube-iframe', {
        height: '200',
        width: '200',
        playerVars: {
            autoplay: 0,
            controls: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1
        },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
        }
    });
}

function onPlayerReady() {
    console.log('YouTube IFrame API ready');
    loadSelectedSource();
}

function loadSelectedSource() {
    if (!player) return;

    stopProgressTimer();
    isPlaying = false;
    updatePlayBtnIcon();
    resetProgressUI();

    const playlistId = getConfiguredPlaylistId();
    const fallbackVideoId = getConfiguredVideoId();
    const status = document.getElementById('playlist-status-text');

    if (!playlistId && !fallbackVideoId) {
        setTrackInfo('YouTube Playlist সেট করুন', 'main.js → playlists');
        renderSongList([]);
        if (status) status.innerText = 'এই tab-এর YouTube URL/Playlist ID দিন';
        return;
    }

    setTrackInfo(getPlaylistDisplayName(), 'YouTube Playlist');

    /*
     * IMPORTANT:
     * First cue the exact video from the user's supplied URL.
     * Then ask the IFrame player to attach the playlist.
     *
     * This prevents the UI from getting stuck on "Playlist load হচ্ছে..."
     * when YouTube does not immediately expose getPlaylist().
     */
    try {
        if (fallbackVideoId && typeof player.cueVideoById === 'function') {
            player.cueVideoById(fallbackVideoId, 0);
        }
    } catch (e) {
        console.warn('YouTube fallback video could not be cued:', e);
    }

    if (playlistId) {
        setTimeout(() => {
            try {
                player.loadPlaylist({
                    listType: 'playlist',
                    list: playlistId,
                    index: 0,
                    startSeconds: 0
                });
                if (status) status.innerText = `${getPlaylistDisplayName()} • YouTube Playlist`;
            } catch (e) {
                console.warn('Playlist API load failed; keeping direct video fallback:', e);
                if (status) status.innerText = `${getPlaylistDisplayName()} • প্রথম গান ready`;
            }
        }, 350);
    } else if (status) {
        status.innerText = `${getPlaylistDisplayName()} • প্রথম গান ready`;
    }

    // Drawer is optional and never blocks playback.
    setTimeout(() => refreshPlaylistDrawer(0), 1500);
}

function getPlaylistDisplayName() {
    return {
        'mahalaya': 'মহালয়া',
        'pujo-prem': 'পূজো প্রেম',
        'pujo-radio': 'পূজো রেডিও'
    }[currentPlaylistKey] || 'YouTube Playlist';
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        updatePlayBtnIcon();
        startProgressTimer();
        updateTrackInfoFromData();
        refreshPlaylistItems();
        highlightCurrentSong();
    } else if (event.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        updatePlayBtnIcon();
        stopProgressTimer();
    } else if (event.data === YT.PlayerState.ENDED) {
        isPlaying = false;
        updatePlayBtnIcon();
        stopProgressTimer();
    } else if (event.data === YT.PlayerState.CUED) {
        updateTrackInfoFromData();
        refreshPlaylistItems();
    }
}

function setTrackInfo(name, artist) {
    const nameEl = document.getElementById('current-track-name');
    const artistEl = document.getElementById('current-artist');
    if (nameEl) nameEl.innerText = name;
    if (artistEl) artistEl.innerText = artist;
}

function updateTrackInfoFromData() {
    if (player && player.getVideoData) {
        const data = player.getVideoData();
        if (data && data.title) setTrackInfo(data.title, data.author || 'YouTube Channel');
    }
}

function updatePlayBtnIcon() {
    const playBtn = document.getElementById('play-pause-btn');
    if (playBtn) playBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
}

function togglePlay() {
    if (!player) return;

    try {
        if (isPlaying) {
            player.pauseVideo();
        } else {
            player.playVideo();
        }
    } catch (e) {
        console.error('Play/Pause failed:', e);
    }
}

function playNextTrack() {
    if (!player) return;

    try {
        const ids = player.getPlaylist ? (player.getPlaylist() || []) : [];
        if (ids.length && typeof player.nextVideo === 'function') {
            player.nextVideo();
            return;
        }

        // Fallback when YouTube has not exposed playlist IDs:
        const currentId = player.getVideoData?.().video_id;
        const index = currentPlaylistItems.findIndex(item => item.videoId === currentId);
        const next = index >= 0 ? currentPlaylistItems[index + 1] : null;
        if (next?.videoId) player.loadVideoById(next.videoId);
    } catch (e) {
        console.error('Next track failed:', e);
    }
}

function playPrevTrack() {
    if (!player) return;

    try {
        const ids = player.getPlaylist ? (player.getPlaylist() || []) : [];
        if (ids.length && typeof player.previousVideo === 'function') {
            player.previousVideo();
            return;
        }

        const currentId = player.getVideoData?.().video_id;
        const index = currentPlaylistItems.findIndex(item => item.videoId === currentId);
        const prev = index > 0 ? currentPlaylistItems[index - 1] : null;
        if (prev?.videoId) player.loadVideoById(prev.videoId);
    } catch (e) {
        console.error('Previous track failed:', e);
    }
}

function startProgressTimer() {
    stopProgressTimer();
    progressInterval = setInterval(() => {
        if (!player?.getCurrentTime || !player?.getDuration) return;
        const currentTime = player.getCurrentTime() || 0;
        const duration = player.getDuration() || 0;
        if (duration <= 0) return;

        const pct = (currentTime / duration) * 100;
        const progressBar = document.getElementById('progress-bar');
        const currTimeEl = document.getElementById('current-time');
        const totalDurEl = document.getElementById('total-duration');
        if (progressBar) progressBar.style.width = pct + '%';
        if (currTimeEl) currTimeEl.innerText = formatTime(currentTime);
        if (totalDurEl) totalDurEl.innerText = formatTime(duration);
    }, 500);
}

function stopProgressTimer() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function resetProgressUI() {
    document.getElementById('progress-bar')?.style && (document.getElementById('progress-bar').style.width = '0%');
    const currTimeEl = document.getElementById('current-time');
    const totalDurEl = document.getElementById('total-duration');
    if (currTimeEl) currTimeEl.innerText = '0:00';
    if (totalDurEl) totalDurEl.innerText = '0:00';
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function toBengaliDigits(number) {
    const bengaliDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
    return String(number).split('').map(d => bengaliDigits[d] ?? d).join('');
}

// ============================================================
// Automatic playlist song list
// No YouTube Data API key is required. We first read the playlist
// video IDs from the IFrame player and then try YouTube oEmbed for
// human-readable titles. If oEmbed is unavailable, numbered tracks
// are still shown and remain playable.
// ============================================================
function refreshPlaylistDrawer(attempt) {
    if (!player || typeof player.getPlaylist !== 'function') return;

    const ids = player.getPlaylist() || [];
    const status = document.getElementById('playlist-status-text');

    if (ids.length) {
        loadPlaylistSongList();
        if (status) status.innerText = `${getPlaylistDisplayName()} • ${ids.length} গান`;
        return;
    }

    // Do not show "load failed". Playback may already be working through
    // the direct-video fallback.
    if (attempt < 10) {
        setTimeout(() => refreshPlaylistDrawer(attempt + 1), 1000);
    } else {
        if (status) status.innerText = `${getPlaylistDisplayName()} • YouTube`;
        renderSongList([]);
    }
}

async function loadPlaylistSongList() {
    if (!player?.getPlaylist) return;

    const ids = player.getPlaylist() || [];
    if (!ids.length) return;

    const fallbackItems = ids.map((videoId, index) => ({
        title: `গান ${index + 1}`,
        author: 'YouTube Playlist',
        videoId
    }));

    currentPlaylistItems = fallbackItems;
    renderSongList(fallbackItems);

    try {
        const titledItems = await Promise.all(ids.map(async (videoId, index) => {
            try {
                const response = await fetch(
                    `https://www.youtube.com/oembed?url=${encodeURIComponent(
                        'https://www.youtube.com/watch?v=' + videoId
                    )}&format=json`
                );

                if (!response.ok) throw new Error('oEmbed failed');

                const data = await response.json();

                return {
                    title: data.title || `গান ${index + 1}`,
                    author: data.author_name || 'YouTube',
                    videoId
                };
            } catch (e) {
                return fallbackItems[index];
            }
        }));

        currentPlaylistItems = titledItems;
        renderSongList(titledItems);
    } catch (e) {
        currentPlaylistItems = fallbackItems;
        renderSongList(fallbackItems);
    }
}

function refreshPlaylistItems() {
    // This is only for keeping the visible drawer synchronized.
    // It is NOT part of the playback flow.
    if (!player?.getPlaylist) return;

    const ids = player.getPlaylist() || [];
    if (!ids.length) return;

    const oldById = new Map(currentPlaylistItems.map(item => [item.videoId, item]));

    currentPlaylistItems = ids.map((videoId, index) =>
        oldById.get(videoId) || {
            title: `গান ${index + 1}`,
            author: 'YouTube Playlist',
            videoId
        }
    );

    renderSongList(currentPlaylistItems);
}

function renderSongList(items) {
    const list = document.getElementById('song-list');
    if (!list) return;

    list.innerHTML = '';
    if (!items.length) {
        const li = document.createElement('li');
        li.className = 'song-item empty-song-list';
        li.innerText = 'Playlist-এর গান এখানে দেখা যাবে';
        list.appendChild(li);
        return;
    }

    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'song-item';
        li.dataset.videoId = item.videoId;
        li.innerHTML = `<span class="song-number">${toBengaliDigits(index + 1)}</span><span class="song-title">${escapeHtml(item.title)}</span>`;
        li.addEventListener('click', () => playSongFromList(item.videoId));
        list.appendChild(li);
    });

    highlightCurrentSong();
}

function playSongFromList(videoId) {
    if (!player || !videoId) return;

    try {
        const ids = player.getPlaylist ? (player.getPlaylist() || []) : [];
        const playlistIndex = ids.indexOf(videoId);

        if (playlistIndex >= 0 && typeof player.playVideoAt === 'function') {
            player.playVideoAt(playlistIndex);
        } else if (typeof player.loadVideoById === 'function') {
            // Direct fallback. This means the drawer never blocks playback.
            player.loadVideoById({
                videoId: videoId,
                startSeconds: 0
            });
        }
    } catch (e) {
        console.error('Could not play selected YouTube video:', e);
    }

    setTimeout(highlightCurrentSong, 250);
}

function onPlayerError(event) {
    console.error('YouTube Player Error:', event.data);
    const status = document.getElementById('playlist-status-text');
    const errors = {
        2: 'Invalid YouTube request',
        5: 'YouTube HTML5 player error',
        100: 'Video পাওয়া যায়নি বা Private',
        101: 'এই video embedding নিষিদ্ধ',
        150: 'এই video embedding নিষিদ্ধ'
    };
    if (status) {
        status.innerText = errors[event.data] || `YouTube playback error (${event.data})`;
    }
}

function highlightCurrentSong() {
    const activeId = player?.getVideoData?.().video_id;
    document.querySelectorAll('.song-item').forEach(item => {
        item.classList.toggle('active', !!activeId && item.dataset.videoId === activeId);
    });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

// ============================================================
// Modal helpers
// ============================================================
function setupModal(buttonId, modalId, closeSelector) {
    const button = document.getElementById(buttonId);
    const modal = document.getElementById(modalId);
    const close = document.querySelector(closeSelector);
    button?.addEventListener('click', () => modal?.classList.add('show'));
    close?.addEventListener('click', () => modal?.classList.remove('show'));
    modal?.addEventListener('click', event => {
        if (event.target === modal) modal.classList.remove('show');
    });
    return modal;
}

function createPujaQrCode() {
    const canvas = document.getElementById('puja-qr-code');
    const link = document.getElementById('puja-list-link');
    if (link) link.href = kolkataPujoListUrl;

    if (canvas && window.QRious) {
        new QRious({
            element: canvas,
            value: kolkataPujoListUrl,
            size: 210,
            level: 'H',
            background: 'white',
            foreground: '#17131b'
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Visitor Tracking
    try {
        const channel = new BroadcastChannel('active_page_visitors');
        const tabId = Math.random().toString(36).substring(2);
        const activeTabs = new Set([tabId]);

        function updateVisitorUI() {
            const el = document.getElementById('visitor-count');
            if (el) el.innerText = toBengaliDigits(activeTabs.size);
        }

        channel.postMessage({ type: 'JOIN', id: tabId });
        updateVisitorUI();

        channel.onmessage = event => {
            if (event.data.type === 'JOIN') {
                activeTabs.add(event.data.id);
                channel.postMessage({ type: 'ACK', id: tabId });
                updateVisitorUI();
            } else if (event.data.type === 'ACK') {
                activeTabs.add(event.data.id);
                updateVisitorUI();
            } else if (event.data.type === 'LEAVE') {
                activeTabs.delete(event.data.id);
                updateVisitorUI();
            }
        };

        window.addEventListener('beforeunload', () => channel.postMessage({ type: 'LEAVE', id: tabId }));
    } catch (e) {
        console.warn('Visitor counter is not available in this browser.');
    }

    // Center Live Clock
    function updateCenterClock() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;

        document.getElementById('clock-hours').innerText = hours < 10 ? '0' + hours : hours;
        document.getElementById('clock-minutes').innerText = minutes < 10 ? '0' + minutes : minutes;
        document.getElementById('clock-ampm').innerText = ampm;
    }
    setInterval(updateCenterClock, 1000);
    updateCenterClock();

    // Pujo Countdown — to Mahalaya / puja season start
    function updatePujoCountdown() {
        const currentYear = new Date().getFullYear();
        let pujoTarget = new Date(currentYear, 9, 15);
        const now = new Date();
        if (now > pujoTarget) pujoTarget = new Date(currentYear + 1, 9, 16);

        const diffTime = Math.max(0, pujoTarget - now);
        const days = Math.floor(diffTime / 86400000);
        const hours = Math.floor((diffTime % 86400000) / 3600000);
        const minutes = Math.floor((diffTime % 3600000) / 60000);
        const countdownStr = `${toBengaliDigits(days)} দিন ${toBengaliDigits(hours < 10 ? '0' + hours : hours)} ঘণ্টা ${toBengaliDigits(minutes < 10 ? '0' + minutes : minutes)} মিনিট`;
        document.getElementById('pujo-countdown').innerText = countdownStr;
    }
    setInterval(updatePujoCountdown, 60000);
    updatePujoCountdown();

    // Dhak: click once = start looping, click again = stop
    const dhakTrigger = document.getElementById('dhak-sound-trigger');
    const dhakAudio = document.getElementById('dhak-audio');

    function triggerDhak() {
        if (!dhakAudio) return;
        if (dhakAudio.paused) {
            dhakAudio.loop = true;
            dhakAudio.play().catch(e => console.log('Dhak playback prevented', e));
            dhakTrigger?.classList.add('dhak-playing');
        } else {
            dhakAudio.pause();
            dhakAudio.currentTime = 0;
            dhakTrigger?.classList.remove('dhak-playing');
        }
        if (dhakTrigger) {
            dhakTrigger.style.transform = 'scale(0.92)';
            setTimeout(() => dhakTrigger.style.transform = '', 150);
        }
    }
    dhakTrigger?.addEventListener('click', triggerDhak);

    // Existing Profile Modal
    setupModal('profile-btn', 'profile-modal', '.profile-modal .close-btn');
    const profileModal = document.getElementById('profile-modal');
    profileModal?.querySelector('.close-btn')?.addEventListener('click', () => profileModal.classList.remove('show'));

    // New Puja Nirghonto + QR modals
    setupModal('nirghonto-btn', 'nirghonto-modal', '.nirghonto-close');
    const qrModal = setupModal('puja-list-btn', 'puja-list-modal', '.puja-list-close');
    createPujaQrCode();
    qrModal?.addEventListener('click', event => {
        if (event.target === qrModal) qrModal.classList.remove('show');
    });

    // Close any open modal with Escape
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    });

    // Player Controls
    document.getElementById('play-pause-btn')?.addEventListener('click', togglePlay);
    document.getElementById('next-btn')?.addEventListener('click', playNextTrack);
    document.getElementById('prev-btn')?.addEventListener('click', playPrevTrack);

    // Playlist drawer
    const drawer = document.getElementById('playlist-drawer');
    document.getElementById('toggle-playlist-btn')?.addEventListener('click', () => drawer?.classList.toggle('open'));
    document.getElementById('close-drawer')?.addEventListener('click', () => drawer?.classList.remove('open'));

    // Playlist tabs — all three are configured in this file
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            const selectedTab = tab.dataset.playlist;
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentPlaylistKey = selectedTab;
            loadSelectedSource();
        });
    });

    // Progress bar click-to-seek
    document.getElementById('progress-wrap')?.addEventListener('click', event => {
        if (!player?.getDuration) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        player.seekTo(ratio * player.getDuration(), true);
    });
});
