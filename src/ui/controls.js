/**
 * 播放器控制栏组件
 * @author kong2dog
 */
export class Controls {
    constructor(player) {
        this.player = player;
        this.container = player.container;
        this.uiLayer = null;
        this.render();
        this.bindEvents();
    }

    render() {
        this.uiLayer = document.createElement('div');
        this.uiLayer.className = 'absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 opacity-0 hover:opacity-100 flex items-center gap-4 text-white';
        this.uiLayer.style.zIndex = '10';

        // 播放/暂停
        const playBtn = document.createElement('button');
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.className = 'hover:text-blue-400 w-8';
        playBtn.onclick = () => this.togglePlay(playBtn);
        this.uiLayer.appendChild(playBtn);

        // 音量
        const volContainer = document.createElement('div');
        volContainer.className = 'flex items-center gap-2 group';
        volContainer.innerHTML = '<i class="fas fa-volume-up w-6"></i>';
        const volSlider = document.createElement('input');
        volSlider.type = 'range';
        volSlider.min = 0;
        volSlider.max = 1;
        volSlider.step = 0.1;
        volSlider.value = 1; // 默认
        volSlider.className = 'w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer';
        volSlider.oninput = (e) => this.player.setVolume(parseFloat(e.target.value));
        volContainer.appendChild(volSlider);
        this.uiLayer.appendChild(volContainer);

        // 占位符
        const spacer = document.createElement('div');
        spacer.className = 'flex-1';
        this.uiLayer.appendChild(spacer);

        // 渲染模式切换
        const modeSwitch = document.createElement('select');
        modeSwitch.className = 'bg-transparent border border-white/30 rounded px-2 py-1 text-sm focus:outline-none';
        modeSwitch.innerHTML = `
            <option value="video" class="text-black">Video 模式</option>
            <option value="canvas" class="text-black">Canvas 模式 (Worker)</option>
        `;
        modeSwitch.onchange = (e) => {
            // 需要在播放器中触发重新加载
            // 目前仅更新状态，演示页面处理重新加载
            this.player.options.renderType = e.target.value;
            console.log('渲染模式更改为', e.target.value);
        };
        this.uiLayer.appendChild(modeSwitch);

        // 全屏
        const fsBtn = document.createElement('button');
        fsBtn.innerHTML = '<i class="fas fa-expand"></i>';
        fsBtn.className = 'hover:text-blue-400 w-8';
        fsBtn.onclick = () => this.player.toggleFullscreen();
        this.uiLayer.appendChild(fsBtn);

        this.container.appendChild(this.uiLayer);
    }

    bindEvents() {
        // 悬停在容器上时显示控件
        this.container.addEventListener('mouseenter', () => {
            this.uiLayer.classList.remove('opacity-0');
        });
        this.container.addEventListener('mouseleave', () => {
            this.uiLayer.classList.add('opacity-0');
        });
    }

    togglePlay(btn) {
        // 切换图标并调用播放器的逻辑
        // 为了演示简单起见
        const isPaused = btn.innerHTML.includes('play');
        if (isPaused) {
            this.player.play();
            btn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            this.player.pause();
            btn.innerHTML = '<i class="fas fa-play"></i>';
        }
    }
}
