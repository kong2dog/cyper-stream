# CyperStream - 高性能 H5 直播流播放器

## 特性 (Features)

- **纯 JavaScript**: 无框架依赖。
- **双渲染引擎**:
  - 标准 `<video>` 标签 (通过 mpegts.js/hls.js)。
  - 高性能 `<canvas>` 标签 (通过 WebCodecs & Web Workers)。
- **低延迟**: 针对 FLV/HLS 直播流优化。
- **Worker 架构**: 解码与解复用卸载至 Web Workers (Canvas 模式下)。
- **自定义 UI**: 使用 Tailwind CSS 构建的响应式控件。

## 安装 (Installation)

```bash
npm install
npm run dev
```

## 使用 (Usage)

```html
<div id="player"></div>
<script type="module">
  import { CyperStream } from "./src/index.js";

  const player = new CyperStream({
    container: "#player",
    renderType: "video", // 或 'canvas'
    buffer: { maxTime: 60 },
  });

  player.load("http://example.com/live.flv", "flv");
</script>
```

## API

### `new CyperStream(options)`

- `container`: 选择器或 HTMLElement。
- `renderType`: `'video'` (默认) 或 `'canvas'`。
- `autoPlay`: 布尔值。
- `buffer`: `{ maxTime: number }`。

### 方法 (Methods)

- `load(url, type)`: 加载流。`type` 为 `'flv'` 或 `'hls'`。
- `play()`: 恢复播放。
- `pause()`: 暂停播放。
- `setVolume(0-1)`: 设置音量。
- `toggleFullscreen()`: 切换全屏模式。
- `switchRenderMode(mode)`: 在 `'video'` 和 `'canvas'` 之间切换。
- `destroy()`: 清理资源。

## 架构 (Architecture)

- **WorkerPool**: 管理解码 Worker，限制为 CPU 核心数 / 2。
- **Canvas 模式**: Worker 中使用 `fetch` -> 自定义 FLV 解复用器 -> `VideoDecoder` (WebCodecs) -> `OffscreenCanvas`。
- **Video 模式**: 使用 `mpegts.js` 和 `hls.js` 封装。

---

_文档维护者: kong2dog_
