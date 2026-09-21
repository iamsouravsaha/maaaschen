// Durga Pujo Nostalgia - Playlist + Puja utilities

// ============================================================
// YOUTUBE PLAYLIST SETTINGS
// Paste either the Playlist ID OR the full YouTube playlist link.
// ============================================================
const playlists = {
    // Add/remove YouTube VIDEO IDs here.
    // Playback no longer depends on YouTube Playlist API.
    'mahalaya': {
        type: 'videos',
        videos: ['YQyo8QeoYhc']
    },

    'pujo-prem': {
        type: 'videos',
        videos: ['qAvT2OcMdnk']
    },

    'pujo-radio': {
        type: 'videos',
        videos: ['fpuadv59iYw']
    }
};

// Kolkata Puja list used for the QR code + clickable link.
const kolkataPujoListUrl = 'https://kolkatakhoj.com/pandals/';

let currentPlaylistKey = 'pujo-radio';
let isPlaying = false;
let player = null;
let progressInterval = null;
let currentPlaylistItems = [];

function normalizeVideoId(value) {
    if (!value) return '';

    const text = String(value).trim();

    // Plain YouTube video ID
    if (!text.includes('youtube.com') && !text.includes('youtu.be')) {
        return text;
    }

    try {
        const url = new URL(text);

        // Standard watch URL
        if (url.searchParams.get('v')) {
            return url.searchParams.get('v');
        }

        // youtu.be/VIDEO_ID
        if (url.hostname.includes('youtu.be')) {
            return url.pathname.replace('/', '').split('/')[0];
        }

        return '';
    } catch (e) {
        const match = text.match(/[?&]v=([^&]+)/);
        return match ? match[1] : '';
    }
}

function getConfiguredVideoIds() {
    const config = playlists[currentPlaylistKey];

    if (!config) return [];

    if (Array.isArray(config.videos)) {
        return config.videos
            .map(normalizeVideoId)
            .filter(Boolean);
    }

    return [];
}

function getConfiguredVideoId() {
    return getConfiguredVideoIds()[0] || '';
}

function onYouTubeIframeAPIReady() {
    const playerVars = {
        autoplay: 0,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1
    };

    // Only send origin when the page is actually hosted over HTTP(S).
    // For file:// pages, origin:null can cause YouTube Error 153.
    if (location.protocol === 'http:' || location.protocol === 'https:') {
        playerVars.origin = location.origin;
    }

    player = new YT.Player('youtube-iframe', {
        height: '200',
        width: '200',
        playerVars: playerVars,
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
        }
    });
}

function onPlayerReady() {
    console.log('YouTube IFrame API ready');

    try {
        const iframe = player.getIframe?.();
        if (iframe) {
            iframe.setAttribute(
                'allow',
                'autoplay; encrypted-media; picture-in-picture; web-share'
            );
            iframe.setAttribute('allowfullscreen', '');
            iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        }
    } catch (e) {
        console.warn('Could not set YouTube iframe permissions:', e);
    }

    loadSelectedSource();
}

function loadSelectedSource() {
    if (!player) return;

    stopProgressTimer();
    isPlaying = false;
    updatePlayBtnIcon();
    resetProgressUI();

    const videoIds = getConfiguredVideoIds();
    const status = document.getElementById('playlist-status-text');

    currentPlaylistItems = videoIds.map((videoId, index) => ({
        title: `গান ${index + 1}`,
        author: 'YouTube',
        videoId
    }));

    renderSongList(currentPlaylistItems);

    if (!videoIds.length) {
        setTrackInfo('YouTube Video ID দিন', 'main.js → playlists');
        if (status) status.innerText = 'এই tab-এর videos list খালি';
        return;
    }

    const firstVideoId = videoIds[0];

    setTrackInfo(getPlaylistDisplayName(), 'YouTube');
    if (status) status.innerText = `${getPlaylistDisplayName()} • ${videoIds.length} গান`;

    try {
        /*
         * No YouTube Playlist API is used.
         * We load the first video directly, then Next/Previous use our own
         * video-ID array. This removes the playlist-loading failure entirely.
         */
        player.loadVideoById({
            videoId: firstVideoId,
            startSeconds: 0
        });
    } catch (e) {
        console.error('Direct YouTube video load failed:', e);
        if (status) status.innerText = 'YouTube video load করা যায়নি';
    }
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
        stopProgressTimer();

        // Automatically move to the next video in our own list.
        playNextTrack();
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
            return;
        }

        // User clicked the button, so this is a valid playback gesture.
        player.playVideo();

        // Some browsers/YouTube builds keep a freshly loaded video in CUED
        // state. Retry once from the same user action if it did not transition.
        setTimeout(() => {
            try {
                const state = player.getPlayerState?.();
                if (state !== YT.PlayerState.PLAYING) {
                    const currentId = player.getVideoData?.().video_id;
                    if (currentId) {
                        player.loadVideoById({
                            videoId: currentId,
                            startSeconds: 0
                        });
                    }
                }
            } catch (retryError) {
                console.error('YouTube playback retry failed:', retryError);
            }
        }, 700);

    } catch (e) {
        console.error('Play/Pause failed:', e);
    }
}

function getCurrentVideoIndex() {
    const ids = getConfiguredVideoIds();
    const currentId = player?.getVideoData?.().video_id || '';
    return ids.indexOf(currentId);
}

function playNextTrack() {
    if (!player) return;

    const ids = getConfiguredVideoIds();
    if (!ids.length) return;

    const currentIndex = getCurrentVideoIndex();
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % ids.length : 0;

    try {
        player.loadVideoById({
            videoId: ids[nextIndex],
            startSeconds: 0
        });
    } catch (e) {
        console.error('Next track failed:', e);
    }
}

function playPrevTrack() {
    if (!player) return;

    const ids = getConfiguredVideoIds();
    if (!ids.length) return;

    const currentIndex = getCurrentVideoIndex();
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : ids.length - 1;

    try {
        player.loadVideoById({
            videoId: ids[prevIndex],
            startSeconds: 0
        });
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
function refreshPlaylistDrawer() {
    // Playlist drawer is populated directly from playlists[].videos.
    // No YouTube Playlist API is required.
    refreshPlaylistItems();
}

async function loadPlaylistSongList() {
    refreshPlaylistItems();
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
        player.loadVideoById({
            videoId: videoId,
            startSeconds: 0
        });
    } catch (e) {
        console.error('Could not play selected YouTube video:', e);
    }

    setTimeout(highlightCurrentSong, 250);
}

function onPlayerError(event) {
    console.error('YouTube IFrame Player Error:', event.data);

    const status = document.getElementById('playlist-status-text');

    const errors = {
        2: 'YouTube Error 2 — Video ID / request invalid',
        5: 'YouTube Error 5 — HTML5 player error',
        100: 'YouTube Error 100 — Video পাওয়া যায়নি / Private / Removed',
        101: 'YouTube Error 101 — এই video অন্য website-এ embed করা নিষিদ্ধ',
        150: 'YouTube Error 150 — এই video অন্য website-এ embed করা নিষিদ্ধ',
        153: 'YouTube Error 153 — YouTube এই embedded request-এর Referer/Origin পাচ্ছে না'
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
