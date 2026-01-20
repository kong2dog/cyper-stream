import {
  DEFAULT_PLAYER_OPTIONS,
  EVENTS,
  EVENTS_ERROR,
  VERSION,
} from "../constant";
import Debug from "../utils/debug";
import Events from "../utils/events";
import property from "./player/property";
import events from "./player/events";
import {
  fpsStatus,
  initPlayTimes,
  isFalse,
  isFullScreen,
  isMobile,
  isPad,
  isNotEmpty,
  now,
  supportMediaStreamTrack,
  supportMSE,
  supportOffscreenV2,
  supportWCS,
} from "../utils";
import Video from "./video";
import Audio from "./audio";
import Recorder from "./recorder";
import DecoderWorker from "./worker/index";
import Emitter from "../utils/emitter";
import Control from "./control";
import observer from "./player/observer";
import NoSleep from "../utils/noSleep";
import screenfull from "screenfull";
import { createPipeline } from "./pipeline";

/**
 * 播放器核心控制器类
 * 负责协调各个模块（视频、音频、解码、流媒体等）的工作
 * 继承自 Emitter 以实现事件发布订阅模式
 */
export default class Player extends Emitter {
  /**
   * 构造函数
   * @param {HTMLElement} container - 播放器容器元素
   * @param {Object} options - 播放器配置选项
   */
  constructor(container, options) {
    super();
    this.$container = container;
    // 合并默认配置和用户配置
    this._opt = Object.assign({}, DEFAULT_PLAYER_OPTIONS, options);
    this.debug = new Debug(this);
    this.debug.log("Player", "init");

    // 强制禁用 OffscreenCanvas，避免兼容性问题
    this._opt.forceNoOffscreen = true;

    // 移动端特殊处理：不自动隐藏控制栏
    if (isMobile() || isPad()) {
      this.debug.log("Player", "isMobile and set _opt.controlAutoHide false");
      this._opt.controlAutoHide = false;
    }

    // 处理自动使用系统全屏的逻辑
    if (this._opt.autoUseSystemFullScreen) {
      if (screenfull.isEnabled && this._opt.useWebFullScreen) {
        this.debug.log(
          "Player",
          "screenfull.isEnabled is true and _opt.useWebFullScreen is true , set _opt.useWebFullScreen false",
        );
        this._opt.useWebFullScreen = false;
      }

      if (
        isFalse(screenfull.isEnabled) &&
        isFalse(this._opt.useWebFullScreen)
      ) {
        this.debug.log(
          "Player",
          "screenfull.isEnabled is false and _opt.useWebFullScreen is false , set _opt.useWebFullScreen true",
        );
        this._opt.useWebFullScreen = true;
      }
    }

    // 检测 WebCodecs 支持
    if (this._opt.useWCS) {
      this._opt.useWCS = supportWCS();
    }

    // 检测 MSE 支持
    if (this._opt.useMSE) {
      this._opt.useMSE = supportMSE();
    }

    // 检测是否支持 MediaStreamTrack 渲染（用于 WCS）
    if (this._opt.wcsUseVideoRender) {
      this._opt.wcsUseVideoRender = supportMediaStreamTrack();
    }

    // 如果使用 MSE，则强制禁用 WebCodecs 和 OffscreenCanvas
    if (this._opt.useMSE) {
      if (this._opt.useWCS) {
        this.debug.log("Player", "useWCS set true->false");
      }

      if (!this._opt.forceNoOffscreen) {
        this.debug.log("Player", "forceNoOffscreen set false->true");
      }

      this._opt.useWCS = false;
      this._opt.forceNoOffscreen = true;
    }

    // 检测 OffscreenCanvas 支持
    if (!this._opt.forceNoOffscreen) {
      if (!supportOffscreenV2()) {
        this._opt.forceNoOffscreen = true;
        this._opt.useOffscreen = false;
      } else {
        this._opt.useOffscreen = true;
      }
    }

    // 如果没有音频，禁用音频按钮
    if (!this._opt.hasAudio) {
      this._opt.operateBtns.audio = false;
    }

    this._opt.hasControl = this._hasControl();

    // 初始化状态标志
    this._loading = false;
    this._playing = false;
    this._hasLoaded = false;
    this._destroyed = false;
    this._closed = false;

    // 初始化定时器引用
    this._checkHeartTimeout = null;
    this._checkLoadingTimeout = null;
    this._checkStatsInterval = null;

    // 初始化统计数据
    this._startBpsTime = null;
    this._isPlayingBeforePageHidden = false;
    this._stats = {
      buf: 0, // 当前缓冲区时长，单位毫秒
      fps: 0, // 当前视频帧率
      abps: 0, // 当前音频码率，单位bit
      vbps: 0, // 当前视频码率，单位bit
      ts: 0, // 当前视频帧pts，单位毫秒
    };

    // 初始化性能统计时间
    this._times = initPlayTimes();

    // 初始化时间戳
    this._videoTimestamp = 0;
    this._audioTimestamp = 0;

    // 注入播放器属性（如rect、width、height等）
    property(this);

    // 初始化各个模块
    this.events = new Events(this);
    this.video = new Video(this);

    if (this._opt.hasAudio) {
      this.audio = new Audio(this);
    }
    this.recorder = new Recorder(this);

    // 根据配置决定是否使用 Worker 解码
    // 注意：Worker 仍然用于 Audio 和 fallback
    if (!this._onlyMseOrWcsVideo()) {
      this.decoderWorker = new DecoderWorker(this);
    } else {
      this.loaded = true;
    }

    this._lastVolume = null;

    // 初始化控制栏
    this.control = new Control(this);

    // 移动端防止息屏
    if (isMobile()) {
      this.keepScreenOn = new NoSleep(this);
    }

    // 初始化 Pipeline
    this.pipeline = createPipeline(this);

    // 注入事件监听和状态观察逻辑
    events(this);
    observer(this);
    this.debug.log("Player", "init and version is", VERSION);

    if (this._opt.useWCS) {
      this.debug.log("Player", "use WCS");
    }

    if (this._opt.useMSE) {
      this.debug.log("Player", "use MSE");
    }

    if (this._opt.useOffscreen) {
      this.debug.log("Player", "use offscreen");
    }

    try {
      this.debug.log("Player options", JSON.stringify(this._opt));
    } catch (e) {
      // ignore
    }
  }

  /**
   * 切换渲染模式 (Video / Canvas)
   * @param {string} mode - 'video' | 'canvas'
   */
  switchRenderType(mode) {
    this.debug.log("Player", "switchRenderType", mode);

    // 保存当前状态
    const currentTime = this.currentTime || 0;
    const isPlaying = this.playing;
    const volume = this.volume;
    const url = this._opt.url;

    // 构造新的配置
    const newOptions = {};
    if (mode === "video") {
      newOptions.useMSE = true;
      newOptions.useWCS = false;
      newOptions.useOffscreen = false;
    } else {
      newOptions.useMSE = false;
      // 尝试启用 WCS 或 WASM
      newOptions.useWCS = supportWCS();
      newOptions.useOffscreen = supportOffscreenV2();
    }

    // 重置并应用新配置
    this.hardReset(newOptions);

    // 重新播放
    if (url) {
      this.play(url)
        .then(() => {
          // 恢复状态
          this.volume = volume;
          if (currentTime > 0) {
            this.seek(currentTime);
          }
          if (!isPlaying) {
            this.pause();
          }
        })
        .catch((e) => {
          this.debug.error("Player", "switchRenderType play failed", e);
        });
    }
  }

  hardReset(options) {
    this.updateOption(options);
    // Close pipeline
    if (this.pipeline) {
      this.pipeline.stop();
    }
    // Re-create pipeline with new options
    this.pipeline = createPipeline(this);
  }

  /**
   * 跳转到指定时间
   * @param {number} time - 单位：秒
   */
  seek(time) {
    if (this.video && this.video.$videoElement) {
      // Video 模式可以直接 seek
      this.video.$videoElement.currentTime = time;
    } else {
      this.debug.warn(
        "Player",
        "Seek in canvas mode is experimental/limited for live streams",
      );
    }
  }

  /**
   * 设置播放速率
   * @param {number} rate
   */
  setPlaybackRate(rate) {
    if (this.video && this.video.$videoElement) {
      this.video.$videoElement.playbackRate = rate;
    }
  }

  /**
   * 切换播放/暂停状态
   */
  togglePlay() {
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * 获取当前播放时间
   */
  get currentTime() {
    if (this.video && this.video.$videoElement) {
      return this.video.$videoElement.currentTime;
    }
    return 0; // Canvas 模式可能需要从 decoder 或 stats 中获取
  }

  /**
   * 销毁播放器，释放所有资源
   */
  async destroy() {
    this._destroyed = true;
    this._loading = false;
    this._playing = false;
    this._hasLoaded = false;
    this._lastVolume = null;
    this._times = initPlayTimes();

    // 停止 Pipeline
    if (this.pipeline) {
      this.pipeline.stop();
      this.pipeline = null;
    }

    // 销毁各个子模块
    if (this.decoderWorker) {
      await this.decoderWorker.destroy();
      this.decoderWorker = null;
    }
    if (this.video) {
      this.video.destroy();
      this.video = null;
    }

    if (this.audio) {
      this.audio.destroy();
      this.audio = null;
    }

    if (this.recorder) {
      this.recorder.destroy();
      this.recorder = null;
    }

    if (this.control) {
      this.control.destroy();
      this.control = null;
    }

    if (this.events) {
      this.events.destroy();
      this.events = null;
    }

    // 清除所有定时器
    this.clearCheckHeartTimeout();
    this.clearCheckLoadingTimeout();
    this.clearStatsInterval();

    // 释放 WakeLock
    this.releaseWakeLock();
    this.keepScreenOn = null;

    // 重置统计数据
    this.resetStats();
    this._audioTimestamp = 0;
    this._videoTimestamp = 0;

    // 触发销毁事件
    this.emit("destroy");
    // 移除所有事件监听
    this.off();

    this.debug.log("play", "destroy end");
  }

  // 全屏属性 setter
  set fullscreen(value) {
    if (isMobile() && this._opt.useWebFullScreen) {
      this.emit(EVENTS.webFullscreen, value);
      setTimeout(() => {
        this.updateOption({
          rotate: value ? 270 : 0,
        });
        this.resize();
      }, 10);
    } else {
      this.emit(EVENTS.fullscreen, value);
    }
  }

  // 全屏属性 getter
  get fullscreen() {
    return isFullScreen() || this.webFullscreen;
  }

  // 网页全屏属性 setter
  set webFullscreen(value) {
    this.emit(EVENTS.webFullscreen, value);
  }

  // 网页全屏属性 getter
  get webFullscreen() {
    return this.$container.classList.contains("cyperstream-fullscreen-web");
  }

  // 加载状态 setter
  set loaded(value) {
    this._hasLoaded = value;
  }

  // 加载状态 getter
  get loaded() {
    return this._hasLoaded;
  }

  // 播放状态 setter
  set playing(value) {
    if (value) {
      // 开始播放时，loading 设置为 false
      this.loading = false;
    }

    if (this.playing !== value) {
      this._playing = value;
      this.emit(EVENTS.playing, value);
      this.emit(EVENTS.volumechange, this.volume);

      if (value) {
        this.emit(EVENTS.play);
      } else {
        this.emit(EVENTS.pause);
      }
    }
  }

  // 播放状态 getter
  get playing() {
    return this._playing;
  }

  // 音量属性 getter
  get volume() {
    return (this.audio && this.audio.volume) || 0;
  }

  // 音量属性 setter
  set volume(value) {
    if (value !== this.volume) {
      this.audio && this.audio.setVolume(value);
      this._lastVolume = value;
    }
  }

  // 上次音量 getter
  get lastVolume() {
    return this._lastVolume;
  }

  // 加载中状态 setter
  set loading(value) {
    if (this.loading !== value) {
      this._loading = value;
      this.emit(EVENTS.loading, this._loading);
    }
  }

  // 加载中状态 getter
  get loading() {
    return this._loading;
  }

  // 录制状态 setter
  set recording(value) {
    if (value) {
      if (this.playing) {
        this.recorder && this.recorder.startRecord();
      }
    } else {
      this.recorder && this.recorder.stopRecordAndSave();
    }
  }

  // 录制状态 getter
  get recording() {
    return this.recorder ? this.recorder.recording : false;
  }

  // 音频时间戳 setter
  set audioTimestamp(value) {
    if (value === null) {
      return;
    }
    this._audioTimestamp = value;
  }

  // 音频时间戳 getter
  get audioTimestamp() {
    return this._audioTimestamp;
  }

  // 视频时间戳 setter
  set videoTimestamp(value) {
    if (value === null) {
      return;
    }
    this._videoTimestamp = value;
    // 仅用于 WASM 解码同步
    if (!this._opt.useWCS && !this._opt.useMSE) {
      if (this.audioTimestamp && this.videoTimestamp) {
        this.audio &&
          this.audio.emit(EVENTS.videoSyncAudio, {
            audioTimestamp: this.audioTimestamp,
            videoTimestamp: this.videoTimestamp,
            diff: this.audioTimestamp - this.videoTimestamp,
          });
      }
    }
  }

  // 视频时间戳 getter
  get videoTimestamp() {
    return this._videoTimestamp;
  }

  // 调试模式 getter
  get isDebug() {
    return this._opt.debug === true;
  }

  /**
   * 更新配置选项
   * @param {Object} options - 新的配置项
   */
  updateOption(options) {
    this._opt = Object.assign({}, this._opt, options);
  }

  /**
   * 初始化播放器各个组件
   * @returns {Promise<void>}
   */
  init() {
    return new Promise((resolve, reject) => {
      // Pipeline initialized in constructor or hardReset.
      // Audio/Video also initialized.

      if (!this.audio) {
        if (this._opt.hasAudio) {
          this.audio = new Audio(this);
        }
      }

      if (!this.decoderWorker && !this._onlyMseOrWcsVideo()) {
        this.decoderWorker = new DecoderWorker(this);
        this.debug.log("Player", "waiting decoderWorker init");
        this.once(EVENTS.decoderWorkerInit, () => {
          this.debug.log("Player", "decoderWorker init success");
          this.loaded = true;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 开始播放
   * @param {string} url - 播放地址
   * @param {Object} options - 播放选项
   * @returns {Promise<void>}
   */
  play(url, options) {
    console.log("Player", "play", url, options);
    return new Promise((resolve, reject) => {
      if (!url && !this._opt.url) {
        return reject();
      }
      this._closed = false;
      this.loading = true;
      this.playing = false;
      this._times.playInitStart = now();
      if (!url) {
        url = this._opt.url;
      }
      this._opt.url = url;

      this.clearCheckHeartTimeout();

      this.init()
        .then(() => {
          this._times.playStart = now();
          // 如果不是静音，取消静音状态
          if (this._opt.isNotMute) {
            this.mute(false);
          }

          this.enableWakeLock();

          // 使用 Pipeline 开始播放
          this.pipeline.start(url);

          // 检查加载超时
          this.checkLoadingTimeout();

          // Pipeline emits events which player handles?
          // Pipeline uses player.emitError so errors are handled.
          // Success event is handled in pipeline callback.
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  /**
   * 关闭播放器
   * @returns {Promise<void>}
   */
  close() {
    return new Promise((resolve, reject) => {
      this._close().then(() => {
        this.video && this.video.clearView();
        resolve();
      });
    });
  }

  /**
   * 暂停后恢复音频播放
   */
  resumeAudioAfterPause() {
    if (this.lastVolume) {
      this.volume = this.lastVolume;
    }
  }

  /**
   * 内部关闭方法
   * @private
   * @returns {Promise<void>}
   */
  _close() {
    return new Promise((resolve, reject) => {
      this._closed = true;

      // Stop Pipeline
      if (this.pipeline) {
        this.pipeline.pause(); // or stop?
      }

      // 销毁解码 Worker
      if (this.decoderWorker) {
        this.decoderWorker.destroy();
        this.decoderWorker = null;
      }

      if (this.audio) {
        this.audio.destroy();
        this.audio = null;
      }
      this.clearCheckHeartTimeout();
      this.clearCheckLoadingTimeout();
      this.clearStatsInterval();
      this.playing = false;
      this.loading = false;
      this.recording = false;

      if (this.video) {
        this.video.resetInit();
        this.video.pause(true);
      }
      // 释放 WakeLock
      this.releaseWakeLock();
      // 重置统计
      this.resetStats();
      //
      this._audioTimestamp = 0;
      this._videoTimestamp = 0;
      //
      this._times = initPlayTimes();
      //
      setTimeout(() => {
        resolve();
      }, 0);
    });
  }

  /**
   * 暂停播放
   * @param {boolean} flag - 是否清除画面，默认 false
   * @returns {Promise<void>}
   */
  pause(flag = false) {
    if (flag) {
      return this.close();
    } else {
      return this._close();
    }
  }

  /**
   * 静音控制
   * @param {boolean} flag - true 为静音，false 为取消静音
   */
  mute(flag) {
    if (this.audio) {
      const prev = this.audio.getLastVolume ? this.audio.getLastVolume() : 0.5; // Fixed if not exists
      this.audio.mute(flag);
      if (flag) {
        this._lastVolume = 0;
      } else {
        this._lastVolume = prev || 0.5;
      }
    }
  }

  /**
   * 调整播放器大小
   */
  resize() {
    this.video.resize();
  }

  /**
   * 开始录制
   * @param {string} fileName - 文件名
   * @param {string} fileType - 文件类型
   */
  startRecord(fileName, fileType) {
    if (this.recording) {
      return;
    }

    this.recorder.setFileName(fileName, fileType);
    this.recording = true;
  }

  /**
   * 停止录制并保存
   */
  stopRecordAndSave() {
    if (this.recording) {
      this.recording = false;
    }
  }

  /**
   * 检查是否显示控制栏
   * @private
   * @returns {boolean}
   */
  _hasControl() {
    let result = false;

    let hasBtnShow = false;
    Object.keys(this._opt.operateBtns).forEach((key) => {
      if (this._opt.operateBtns[key]) {
        hasBtnShow = true;
      }
    });

    if (this._opt.showBandwidth || this._opt.text || hasBtnShow) {
      result = true;
    }

    return result;
  }

  /**
   * 检查是否仅使用 MSE 或 WCS 视频渲染
   * @private
   * @returns {boolean}
   */
  _onlyMseOrWcsVideo() {
    return (
      this._opt.hasAudio === false &&
      (this._opt.useMSE || (this._opt.useWCS && !this._opt.useOffscreen))
    );
  }

  /**
   * 触发心跳检查
   */
  checkHeart() {
    this.clearCheckHeartTimeout();
    this.checkHeartTimeout();
  }

  /**
   * 心跳超时检查
   * 如果渲染间隔超过指定时间（默认暂停后），则抛出异常
   */
  checkHeartTimeout() {
    this._checkHeartTimeout = setTimeout(() => {
      if (this.playing) {
        // 再次检查 fps，如果不为 0 说明还在渲染
        if (this._stats.fps !== 0) {
          return;
        }
        if (this.isDestroyedOrClosed()) {
          return;
        }

        this.pause().then(() => {
          this.emit(EVENTS.timeout, EVENTS.delayTimeout);
          this.emit(EVENTS.delayTimeout);
        });
      }
    }, this._opt.heartTimeout * 1000);
  }

  /**
   * 开启性能统计定时器
   */
  checkStatsInterval() {
    this._checkStatsInterval = setInterval(() => {
      this.updateStats();
    }, 1000);
  }

  /**
   * 清除心跳超时定时器
   */
  clearCheckHeartTimeout() {
    if (this._checkHeartTimeout) {
      clearTimeout(this._checkHeartTimeout);
      this._checkHeartTimeout = null;
    }
  }

  /**
   * 检查加载超时
   * 如果在指定时间内未加载完成，则触发超时事件
   */
  checkLoadingTimeout() {
    const newLoadingTimeout = this._opt.loadingTimeout;

    this.debug.log(
      "Player",
      `checkLoadingTimeout loadingTimeout is ${this._opt.loadingTimeout}`,
    );
    this._checkLoadingTimeout = setTimeout(() => {
      // check again
      if (this.playing) {
        return;
      }
      if (this.isDestroyedOrClosed()) {
        return;
      }
      this.pause().then(() => {
        this.emit(EVENTS.timeout, EVENTS.loadingTimeout);
        this.emit(EVENTS.loadingTimeout);
      });
    }, newLoadingTimeout * 1000);
  }

  /**
   * 清除加载超时定时器
   */
  clearCheckLoadingTimeout() {
    if (this._checkLoadingTimeout) {
      clearTimeout(this._checkLoadingTimeout);
      this._checkLoadingTimeout = null;
    }
  }

  /**
   * 清除性能统计定时器
   */
  clearStatsInterval() {
    if (this._checkStatsInterval) {
      clearInterval(this._checkStatsInterval);
      this._checkStatsInterval = null;
    }
  }

  /**
   * 处理每一帧渲染
   * 由子模块调用，用于更新状态和心跳
   */
  handleRender() {
    if (this.isDestroyedOrClosed()) {
      return;
    }

    if (this.loading) {
      this.emit(EVENTS.start);
      this.loading = false;
      this.clearCheckLoadingTimeout();
    }
    if (!this.playing) {
      this.playing = true;
    }
    this.checkHeart();
  }

  /**
   * 更新播放统计信息
   * @param {Object} options - 统计数据
   */
  updateStats(options = {}) {
    if (this.isDestroyedOrClosed()) {
      return;
    }

    if (!this._startBpsTime) {
      this._startBpsTime = now();
    }

    if (isNotEmpty(options.ts)) {
      this._stats.ts = options.ts;
    }

    if (isNotEmpty(options.buf)) {
      this._stats.buf = options.buf;
    }

    if (options.fps) {
      this._stats.fps += 1;
    }
    if (options.abps) {
      this._stats.abps += options.abps;
    }
    if (options.vbps) {
      this._stats.vbps += options.vbps;
    }

    const _nowTime = now();
    const timestamp = _nowTime - this._startBpsTime;

    // 每秒更新一次
    if (timestamp < 1 * 1000) {
      return;
    }

    this.emit(EVENTS.stats, this._stats);
    this.emit(EVENTS.performance, fpsStatus(this._stats.fps));
    this._stats.fps = 0;
    this._stats.abps = 0;
    this._stats.vbps = 0;
    this._startBpsTime = _nowTime;
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this._startBpsTime = null;
    this._stats = {
      buf: 0, //ms
      fps: 0,
      abps: 0,
      vbps: 0,
      ts: 0,
    };
  }

  /**
   * 启用屏幕常亮（仅移动端）
   */
  enableWakeLock() {
    if (this._opt.keepScreenOn) {
      this.keepScreenOn && this.keepScreenOn.enable();
    }
  }

  /**
   * 释放屏幕常亮
   */
  releaseWakeLock() {
    if (this._opt.keepScreenOn) {
      this.keepScreenOn && this.keepScreenOn.disable();
    }
  }

  /**
   * 处理播放到渲染的时间统计
   */
  handlePlayToRenderTimes() {
    if (this.isDestroyedOrClosed()) {
      return;
    }

    const _times = this._times;
    _times.playTimestamp = _times.playStart - _times.playInitStart;
    _times.streamTimestamp = _times.streamStart - _times.playStart;
    _times.streamResponseTimestamp = _times.streamResponse - _times.streamStart;
    _times.demuxTimestamp = _times.demuxStart - _times.streamResponse;
    _times.decodeTimestamp = _times.decodeStart - _times.demuxStart;
    _times.videoTimestamp = _times.videoStart - _times.decodeStart;
    _times.allTimestamp = _times.videoStart - _times.playInitStart;
    this.emit(EVENTS.playToRenderTimes, _times);
  }

  /**
   * 获取当前配置
   * @returns {Object}
   */
  getOption() {
    return this._opt;
  }

  /**
   * 触发错误事件
   * @param {string} errorType - 错误类型
   * @param {string} message - 错误信息
   */
  emitError(errorType, message = "") {
    this.emit(EVENTS.error, errorType, message);
    this.emit(errorType, message);
  }

  /**
   * 检查控制栏是否显示
   * @returns {boolean}
   */
  isControlBarShow() {
    const hasControl = this._opt.hasControl;
    const controlAutoHide = this._opt.controlAutoHide;

    let result = hasControl && !controlAutoHide;

    if (result) {
      if (this.control) {
        result = this.control.getBarIsShow();
      }
    }

    return result;
  }

  /**
   * 获取控制栏显示状态
   * @returns {boolean}
   */
  getControlBarShow() {
    let result = false;
    if (this.control) {
      result = this.control.getBarIsShow();
    }
    return result;
  }

  /**
   * 切换控制栏显示/隐藏
   * @param {boolean} isShow
   */
  toggleControlBar(isShow) {
    if (this.control) {
      this.control.toggleBar(isShow);
      this.resize();
    }
  }

  /**
   * 是否已销毁
   * @returns {boolean}
   */
  isDestroyed() {
    return this._destroyed;
  }

  /**
   * 是否已关闭
   * @returns {boolean}
   */
  isClosed() {
    return this._closed;
  }

  /**
   * 是否已销毁或已关闭
   * @returns {boolean}
   */
  isDestroyedOrClosed() {
    return this.isDestroyed() || this.isClosed();
  }
}
