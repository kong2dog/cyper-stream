export class ControlBar {
    constructor(playerInstance) {
        this.player = playerInstance;
        this.container = playerInstance.wrapper;
        this._build();
        this._bindEvents();
    }

    _build() {
        const bar = document.createElement('div');
        bar.className = 'absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 opacity-0 group-hover:opacity-100 flex items-center justify-between text-white';
        
        // Left Controls
        const left = document.createElement('div');
        left.className = 'flex items-center gap-4';
        
        // Play/Pause
        this.playBtn = this._createBtn('fa-play', 'Play');
        left.appendChild(this.playBtn);

        // Volume
        const volContainer = document.createElement('div');
        volContainer.className = 'flex items-center gap-2 group/vol';
        this.volBtn = this._createBtn('fa-volume-high', 'Mute');
        this.volSlider = document.createElement('input');
        this.volSlider.type = 'range';
        this.volSlider.min = 0;
        this.volSlider.max = 1;
        this.volSlider.step = 0.1;
        this.volSlider.value = 0; // Default muted
        this.volSlider.className = 'w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer';
        volContainer.appendChild(this.volBtn);
        volContainer.appendChild(this.volSlider);
        left.appendChild(volContainer);

        // Live Indicator
        const liveBadge = document.createElement('div');
        liveBadge.className = 'flex items-center gap-1 text-red-500 font-bold text-xs px-2 py-1 bg-red-500/10 rounded';
        liveBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> LIVE';
        left.appendChild(liveBadge);

        // Right Controls
        const right = document.createElement('div');
        right.className = 'flex items-center gap-4';

        // Stats Toggle
        this.statsBtn = this._createBtn('fa-chart-line', 'Stats');
        right.appendChild(this.statsBtn);

        // Render Mode
        this.modeBtn = document.createElement('button');
        this.modeBtn.className = 'text-xs font-mono border border-white/30 px-2 py-1 rounded hover:bg-white/10';
        this.modeBtn.textContent = 'VIDEO';
        right.appendChild(this.modeBtn);

        // Screenshot
        this.shotBtn = this._createBtn('fa-camera', 'Screenshot');
        right.appendChild(this.shotBtn);

        // Fullscreen
        this.fsBtn = this._createBtn('fa-expand', 'Fullscreen');
        right.appendChild(this.fsBtn);

        bar.appendChild(left);
        bar.appendChild(right);
        this.container.appendChild(bar);

        // Stats Overlay
        this.statsOverlay = document.createElement('div');
        this.statsOverlay.className = 'absolute top-4 right-4 bg-black/60 p-4 rounded text-xs text-green-400 font-mono hidden pointer-events-none';
        this.statsOverlay.innerHTML = `
            <div>FPS: <span id="stat-fps">0</span></div>
            <div>Bitrate: <span id="stat-bitrate">0</span> kbps</div>
            <div>Buffer: <span id="stat-buffer">0</span> s</div>
            <div>Jitter: <span id="stat-jitter">0</span> ms</div>
        `;
        this.container.appendChild(this.statsOverlay);
    }

    _createBtn(iconClass, title) {
        const btn = document.createElement('button');
        btn.className = 'hover:text-blue-400 transition-colors';
        btn.title = title;
        btn.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
        return btn;
    }

    _bindEvents() {
        // Play/Pause
        this.playBtn.addEventListener('click', () => {
            if (this.player.videoElement.paused) {
                this.player.play();
                this.playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            } else {
                this.player.pause();
                this.playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            }
        });

        // Volume
        this.volSlider.addEventListener('input', (e) => {
            this.player.setVolume(e.target.value);
            this._updateVolIcon(e.target.value);
        });

        // Mode Switch
        this.modeBtn.addEventListener('click', () => {
            const current = this.player.options.renderMode;
            const next = current === 'video' ? 'canvas' : 'video';
            this.player.setRenderMode(next);
            this.modeBtn.textContent = next.toUpperCase();
        });

        // Screenshot
        this.shotBtn.addEventListener('click', () => {
            this._takeScreenshot();
        });

        // Fullscreen
        this.fsBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                this.container.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });

        // Stats
        this.statsBtn.addEventListener('click', () => {
            this.statsOverlay.classList.toggle('hidden');
        });

        // Loop for stats update
        setInterval(() => this._updateStats(), 1000);
    }

    _updateVolIcon(val) {
        let icon = 'fa-volume-xmark';
        if (val > 0.5) icon = 'fa-volume-high';
        else if (val > 0) icon = 'fa-volume-low';
        this.volBtn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    }

    _takeScreenshot() {
        const canvas = document.createElement('canvas');
        canvas.width = this.player.videoElement.videoWidth;
        canvas.height = this.player.videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.player.videoElement, 0, 0);
        
        const link = document.createElement('a');
        link.download = `snapshot-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    _updateStats() {
        if (this.statsOverlay.classList.contains('hidden')) return;
        
        // Mock stats or real if available from mpegts
        const engine = this.player.player;
        if (!engine) return;

        if (engine.statisticsInfo) { 
             // mpegts
             const s = engine.statisticsInfo;
             document.getElementById('stat-fps').textContent = s.currentFPS.toFixed(1);
             document.getElementById('stat-bitrate').textContent = Math.round(s.videoBitrate);
             // Buffer calculation for mpegts usually involves ranges
             // This is a simplified view
        } else if (engine.bandwidthEstimate) {
            // hls.js (rough estimate)
             document.getElementById('stat-bitrate').textContent = (engine.bandwidthEstimate / 1000).toFixed(0);
             // HLS.js doesn't give FPS easily without parsing, using video element
             // We can use video element stats
        }

        // Common video stats
        if (this.player.videoElement) {
             const v = this.player.videoElement;
             if (v.getVideoPlaybackQuality) {
                 // v.getVideoPlaybackQuality().totalVideoFrames
             }
             // Buffer
             if (v.buffered && v.buffered.length) {
                 const end = v.buffered.end(v.buffered.length - 1);
                 const current = v.currentTime;
                 document.getElementById('stat-buffer').textContent = (end - current).toFixed(2);
             }
        }
        
        // Trigger worker for jitter calc
        this.player.calculateJitter();
    }
}
