# CyperStream - 高性能 H5 直播流播放器

CyperStream 是一个基于现代 Web 技术构建的高性能 H5 直播流播放器，旨在为低延迟直播场景提供卓越的播放体验。它支持 FLV 和 HLS 协议，具备双渲染引擎架构，并针对移动端和桌面端进行了深度优化。

## 主要特性 (Features)

- **双渲染引擎架构**:
  - **Video 模式**: 利用浏览器原生 `<video>` 标签，结合 `mpegts.js` 和 `hls.js` 提供稳定的播放能力。
  - **Canvas 模式**: 基于 `WebCodecs` + `Web Workers` + `WebGL` 的高性能渲染方案，实现极低延迟和精准的帧控制。
- **协议支持**: 完美支持 HTTP-FLV 和 HLS 直播流。
- **高性能解码**: 在 Canvas 模式下，利用 Web Worker 进行多线程解码和解复用，避免阻塞主线程。
- **低延迟优化**: 针对直播场景优化的缓冲区管理策略，确保毫秒级延迟。
- **零依赖设计**: 核心库不依赖任何前端框架（Vue/React），可轻松集成到任何项目中。
- **现代化 UI**: 内置基于 Tailwind CSS 的响应式控制栏，支持自定义扩展。

## 快速开始 (Quick Start)

### 安装 (Installation)

1. 安装依赖：

```bash
npm install
```

2. 启动开发服务器：

```bash
npm run dev
```

### 基本使用 (Usage)

在 HTML 文件中引入样式和脚本：

```html
<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="path/to/style.css" />
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="player-container" style="width: 800px; height: 450px;"></div>

    <script type="module">
      import { CyperStream } from "./src/index.js";

      // 1. 初始化播放器
      const player = new CyperStream({
        container: "#player-container", // 支持选择器字符串或 DOM 元素
        renderType: "video", // 渲染模式: 'video' (默认) 或 'canvas'
        autoPlay: true, // 是否自动播放
        buffer: { maxTime: 10 }, // 缓冲区配置
      });

      // 2. 播放直播流
      // 播放 FLV 流
      player.play("http://example.com/live.flv");

      // 或者播放 HLS 流
      // player.play('http://example.com/live.m3u8', { type: 'hls' });
    </script>
  </body>
</html>
```

## API 文档

### `CyperStream` 类

`CyperStream` 继承自 `Player` 类，是播放器的主要入口。

#### 构造函数

```javascript
const player = new CyperStream(options);
```

**Options 配置项:**
| 参数名 | 类型 | 默认值 | 说明 |
|Ref | Type | Default | Description|
|---|---|---|---|
| `container` | String \| HTMLElement | - | **必填**。播放器挂载容器的选择器或 DOM 元素。 |
| `renderType` | String | `'video'` | 渲染模式。可选 `'video'` (原生) 或 `'canvas'` (高性能)。 |
| `autoPlay` | Boolean | `false` | 是否自动播放。 |
| `useWCS` | Boolean | `true` | 是否启用 WebCodecs (仅 Canvas 模式)。 |
| `useMSE` | Boolean | `true` | 是否启用 MSE (Media Source Extensions)。 |
| `isNotMute` | Boolean | `false` | 是否默认开启声音 (默认静音以规避自动播放策略)。 |

### `Player` 类方法

#### 播放控制

- **`play(url, options)`**
  - 开始播放。
  - `url`: 直播流地址。
  - `options`: 可选配置，如 `{ type: 'flv' }`。
- **`pause()`**
  - 暂停播放。
- **`togglePlay()`**
  - 切换播放/暂停状态。
- **`close()`**
  - 关闭当前播放，保留播放器实例。
- **`destroy()`**
  - 销毁播放器实例，释放所有资源（DOM、事件监听、Worker）。

#### 状态控制

- **`seek(time)`**
  - 跳转到指定时间（单位：秒）。
- **`setPlaybackRate(rate)`**
  - 设置播放速率 (如 0.5, 1.0, 1.5, 2.0)。
- **`mute(flag)`**
  - 静音控制。`true` 为静音，`false` 为取消静音。
- **`setVolume(volume)`**
  - 设置音量 (0.0 - 1.0)。
- **`toggleFullscreen()`**
  - 切换全屏模式。
- **`switchRenderType(mode)`**
  - 动态切换渲染模式 (`'video'` <-> `'canvas'`)。

#### 录制功能

- **`startRecord(fileName, fileType)`**
  - 开始录制当前流。
- **`stopRecordAndSave()`**
  - 停止录制并下载文件。

### 事件监听

继承自 `Emitter`，使用 `on` / `off` 监听事件。

```javascript
import { EVENTS } from "./src/constant/index.js";

player.on(EVENTS.play, () => console.log("开始播放"));
player.on(EVENTS.pause, () => console.log("暂停播放"));
player.on(EVENTS.error, (type, msg) => console.error("错误:", msg));
player.on(EVENTS.loading, (isLoading) => console.log("加载状态:", isLoading));
```

## 开发指南 (Development)

### 项目结构

```text
src/
├── constant/       # 常量定义
├── core/           # 核心逻辑
│   ├── audio/      # 音频处理
│   ├── decoder/    # 解码器 (WebCodecs, MSE)
│   ├── demux/      # 解复用 (FLV)
│   ├── loader/     # 流加载 (Fetch)
│   ├── video/      # 视频渲染 (Canvas, Video)
│   ├── worker/     # Web Worker 线程
│   ├── Player.js   # 播放器基类
│   └── pipeline.js # 数据流水线
├── ui/             # 内置 UI 组件
├── utils/          # 工具函数
└── index.js        # 入口文件
```

---

_文档维护者: CyperStream Team_
