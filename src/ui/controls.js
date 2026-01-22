import { EVENTS } from '../constant/index.js';

/**
 * 播放器控制栏组件
 */
export class Controls {
    constructor(player) {
        this.player = player;
        this.container = player.$container;
        this.uiLayer = null;
        this.loadingLayer = null;
        this.errorLayer = null;
        this._handlers = {}; // Store handlers for cleanup
        this._init();
    }

    _init() {
        this.render();
        this.bindEvents();
        this.bindPlayerEvents();
    }

    render() {
        // 1. 创建 UI 控制层 (Control Bar)
        this.uiLayer = document.createElement('div');
        this.uiLayer.className = 'absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/90 to-transparent transition-opacity duration-300 opacity-0 hover:opacity-100 flex flex-col gap-2 text-white z-50';
        
        // ... (Existing Control Bar Code) ...
        // 进度条容器
        const progressContainer = document.createElement('div');
        progressContainer.className = 'w-full flex items-center gap-2 mb-1';
        
        // 进度条
        this.progressBar = document.createElement('input');
        this.progressBar.type = 'range';
        this.progressBar.min = 0;
        this.progressBar.max = 100;
        this.progressBar.value = 0;
        this.progressBar.className = 'w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer hover:h-2 transition-all';
        progressContainer.appendChild(this.progressBar);
        this.uiLayer.appendChild(progressContainer);

        // 控制按钮行
        const controlsRow = document.createElement('div');
        controlsRow.className = 'flex items-center justify-between';

        // 左侧控制区
        const leftControls = document.createElement('div');
        leftControls.className = 'flex items-center gap-4';

        // 播放/暂停按钮
        this.playBtn = document.createElement('button');
        this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        this.playBtn.className = 'hover:text-blue-400 w-8 text-center transition-colors';
        this.playBtn.title = '播放/暂停';
        leftControls.appendChild(this.playBtn);

        // 音量控制区
        const volContainer = document.createElement('div');
        volContainer.className = 'flex items-center gap-2 group relative';
        
        this.muteBtn = document.createElement('button');
        this.muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        this.muteBtn.className = 'hover:text-blue-400 w-6 text-center transition-colors';
        this.muteBtn.title = '静音';
        
        this.volSlider = document.createElement('input');
        this.volSlider.type = 'range';
        this.volSlider.min = 0;
        this.volSlider.max = 1;
        this.volSlider.step = 0.1;
        this.volSlider.value = 1;
        this.volSlider.className = 'w-0 group-hover:w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer transition-all duration-300 overflow-hidden';
        
        volContainer.appendChild(this.muteBtn);
        volContainer.appendChild(this.volSlider);
        leftControls.appendChild(volContainer);

        // 时间显示
        this.timeDisplay = document.createElement('div');
        this.timeDisplay.className = 'text-xs font-mono text-gray-300';
        this.timeDisplay.innerText = '00:00 / 00:00';
        leftControls.appendChild(this.timeDisplay);

        controlsRow.appendChild(leftControls);

        // 右侧控制区
        const rightControls = document.createElement('div');
        rightControls.className = 'flex items-center gap-4';

        // 播放速率
        this.speedSelect = document.createElement('select');
        this.speedSelect.className = 'bg-transparent text-xs border border-white/30 rounded px-1 py-0.5 focus:outline-none hover:bg-white/10 cursor-pointer';
        ['0.5', '1.0', '1.5', '2.0'].forEach(rate => {
            const opt = document.createElement('option');
            opt.value = rate;
            opt.text = rate + 'x';
            opt.className = 'text-black';
            if (rate === '1.0') opt.selected = true;
            this.speedSelect.appendChild(opt);
        });
        rightControls.appendChild(this.speedSelect);

        // 渲染模式切换
        this.modeBtn = document.createElement('button');
        this.modeBtn.className = 'text-xs font-bold border border-blue-500/50 px-2 py-0.5 rounded hover:bg-blue-500/20 transition-colors';
        this.modeBtn.innerText = 'VIDEO';
        this.modeBtn.title = '切换渲染模式 (Video/Canvas)';
        rightControls.appendChild(this.modeBtn);

        // 全屏按钮
        this.fsBtn = document.createElement('button');
        this.fsBtn.innerHTML = '<i class="fas fa-expand"></i>';
        this.fsBtn.className = 'hover:text-blue-400 w-8 text-center transition-colors';
        this.fsBtn.title = '全屏';
        rightControls.appendChild(this.fsBtn);

        controlsRow.appendChild(rightControls);
        this.uiLayer.appendChild(controlsRow);
        
        // 2. 创建 Loading 层
        this.loadingLayer = document.createElement('div');
        this.loadingLayer.className = 'absolute inset-0 flex items-center justify-center bg-black/50 z-40 hidden pointer-events-none';
        this.loadingLayer.innerHTML = '<i class="fas fa-spinner fa-spin text-5xl text-blue-500 drop-shadow-lg"></i>';

        // 3. 创建 Error 层
        this.errorLayer = document.createElement('div');
        this.errorLayer.className = 'absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50 hidden';
        this.errorLayer.innerHTML = `
            <i class="fas fa-exclamation-circle text-5xl text-red-500 mb-4"></i>
            <div class="text-white mb-6 text-center px-6 max-w-md text-sm md:text-base" id="controls-error-msg">播放出错</div>
            <button id="controls-retry-btn" class="px-6 py-2 bg-blue-600 rounded hover:bg-blue-500 transition-colors text-sm font-medium shadow-lg">
                <i class="fas fa-redo-alt mr-2"></i>重试
            </button>
        `;

        // 4. 将所有层添加到容器
        if (this.container) {
            this.container.appendChild(this.loadingLayer);
            this.container.appendChild(this.errorLayer);
            this.container.appendChild(this.uiLayer);
        } else {
            console.error('Controls', 'container is invalid', this.container);
        }
    }

    bindEvents() {
        // UI 显示/隐藏交互
        this.container.addEventListener('mouseenter', () => {
            this.uiLayer.classList.remove('opacity-0');
        });
        this.container.addEventListener('mouseleave', () => {
            this.uiLayer.classList.add('opacity-0');
        });

        // 播放控制
        this.playBtn.onclick = () => this.player.togglePlay();

        // 进度条拖动
        this.progressBar.oninput = (e) => {
            // 这里主要针对 Video 模式，Canvas 模式对于直播流 seek 支持有限
            const time = parseFloat(e.target.value);
            // 假设 max 是 duration，实际直播流可能需要特殊处理
            // 简单实现：如果是 Video 模式且有 duration
            if (this.player.video && this.player.video.$videoElement) {
                const duration = this.player.video.$videoElement.duration;
                if (duration && isFinite(duration)) {
                    this.player.seek((time / 100) * duration);
                }
            }
        };

        // 音量控制
        this.volSlider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            this.player.volume = val;
            this._updateVolIcon(val);
        };

        this.muteBtn.onclick = () => {
            const currentVol = parseFloat(this.volSlider.value);
            if (currentVol > 0) {
                this.lastVol = currentVol;
                this.player.volume = 0;
                this.volSlider.value = 0;
                this._updateVolIcon(0);
            } else {
                const restore = this.lastVol || 1;
                this.player.volume = restore;
                this.volSlider.value = restore;
                this._updateVolIcon(restore);
            }
        };

        // 倍速控制
        this.speedSelect.onchange = (e) => {
            this.player.setPlaybackRate(parseFloat(e.target.value));
        };

        // 渲染模式切换
        this.modeBtn.onclick = () => {
            const currentMode = this.modeBtn.innerText === 'VIDEO' ? 'video' : 'canvas';
            const nextMode = currentMode === 'video' ? 'canvas' : 'video';
            this.player.switchRenderType(nextMode);
            this.modeBtn.innerText = nextMode.toUpperCase();
        };

        // 全屏
        this.fsBtn.onclick = () => {
            this.player.toggleFullscreen();
        };

        // 错误重试
        const retryBtn = this.errorLayer.querySelector('#controls-retry-btn');
        if (retryBtn) {
            retryBtn.onclick = () => {
                this.hideError();
                // 尝试重新加载当前 URL
                const currentUrl = this.player._opt.url;
                if (currentUrl) {
                    this.player.load(currentUrl);
                }
            };
        }
    }

    bindPlayerEvents() {
        // 保存 handler 引用以便后续解绑（虽然本 Demo 中未严格执行 destroy，但在正式项目中很重要）
        this._handlers.play = () => {
            this.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        };
        this._handlers.pause = () => {
            this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
        };
        this._handlers.loading = (isLoading) => {
            if (isLoading) this.showLoading();
            else this.hideLoading();
        };
        this._handlers.error = (type, msg) => {
            this.hideLoading(); // 报错时隐藏 loading
            this.showError(msg || '发生未知错误');
        };

        // 监听播放器事件
        this.player.on(EVENTS.play, this._handlers.play);
        this.player.on(EVENTS.pause, this._handlers.pause);
        this.player.on(EVENTS.loading, this._handlers.loading);
        this.player.on(EVENTS.error, this._handlers.error);

        // 使用轮询更新进度条和时间，兼容性更好
        this.updateInterval = setInterval(() => {
            this._updateUI();
        }, 500);
    }

    showLoading() {
        if (this.loadingLayer) this.loadingLayer.classList.remove('hidden');
    }

    hideLoading() {
        if (this.loadingLayer) this.loadingLayer.classList.add('hidden');
    }

    showError(msg) {
        if (this.errorLayer) {
            const msgEl = this.errorLayer.querySelector('#controls-error-msg');
            if (msgEl) msgEl.innerText = msg;
            this.errorLayer.classList.remove('hidden');
        }
    }

    hideError() {
        if (this.errorLayer) this.errorLayer.classList.add('hidden');
    }

    _updateUI() {
        if (!this.player || this.player.isDestroyed()) {
            clearInterval(this.updateInterval);
            return;
        }

        // 更新时间
        let currentTime = 0;
        let duration = 0;

        if (this.player.video && this.player.video.$videoElement) {
            currentTime = this.player.video.$videoElement.currentTime || 0;
            duration = this.player.video.$videoElement.duration || 0;
        } 
        // Canvas 模式下时间获取比较困难，这里暂时仅支持 Video 模式的时间显示
        
        if (isFinite(duration) && duration > 0) {
            this.progressBar.value = (currentTime / duration) * 100;
            this.timeDisplay.innerText = `${this._formatTime(currentTime)} / ${this._formatTime(duration)}`;
        } else {
            // 直播流或者无法获取时长
            this.timeDisplay.innerText = this._formatTime(currentTime);
        }

        // 自动同步渲染模式按钮状态（防止外部修改导致 UI 不同步）
        const isMSE = this.player._opt.useMSE;
        this.modeBtn.innerText = isMSE ? 'VIDEO' : 'CANVAS';
    }

    _formatTime(seconds) {
        if (!seconds || !isFinite(seconds)) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    _updateVolIcon(val) {
        if (val === 0) {
            this.muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else if (val < 0.5) {
            this.muteBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
        } else {
            this.muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        // 解绑事件
        if (this.player && this._handlers) {
            this.player.off(EVENTS.play, this._handlers.play);
            this.player.off(EVENTS.pause, this._handlers.pause);
            this.player.off(EVENTS.loading, this._handlers.loading);
            this.player.off(EVENTS.error, this._handlers.error);
        }

        // 移除 DOM
        [this.uiLayer, this.loadingLayer, this.errorLayer].forEach(el => {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
    }
}
