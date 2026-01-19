/**
 * CyperStream Constants
 */

// Play Protocol
export const PLAYER_PLAY_PROTOCOL = {
  websocket: 0,
  fetch: 1,
  webrtc: 2,
};

export const DEMUX_TYPE = {
  flv: "flv",
  m7s: "m7s",
};

export const FILE_SUFFIX = {
  mp4: "mp4",
  webm: "webm",
};

export const MEDIA_SOURCE_UPDATE_END_TIMEOUT = 10 * 1000;

export const CONTAINER_DATA_SET_KEY = "cyperstream";

export const VERSION = "1.0.0";

// Default player options
export const DEFAULT_PLAYER_OPTIONS = {
  videoBuffer: 1000, // 1000ms = 1 second
  videoBufferDelay: 1000, // 1000ms
  isResize: true,
  isFullResize: false,
  isFlv: false,
  debug: false,
  hotKey: false,
  loadingTimeout: 10, // loading timeout
  heartTimeout: 5, // heart timeout
  timeout: 10, // second
  loadingTimeoutReplay: true,
  heartTimeoutReplay: true,
  loadingTimeoutReplayTimes: 3,
  heartTimeoutReplayTimes: 3,
  supportDblclickFullscreen: false,
  showBandwidth: false,
  keepScreenOn: false,
  isNotMute: false,
  hasAudio: true,
  hasVideo: true,
  operateBtns: {
    fullscreen: false,
    screenshot: false,
    play: false,
    audio: false,
    record: false,
  },
  controlAutoHide: false,
  hasControl: false,
  loadingText: "",
  background: "",
  decoder: "decoder.js?v=fixed-1", // WASM decoder path
  url: "",
  rotate: 0,
  forceNoOffscreen: true,
  hiddenAutoPause: false,
  protocol: PLAYER_PLAY_PROTOCOL.fetch,
  demuxType: DEMUX_TYPE.flv,
  useWCS: false, // WebCodecs
  wcsUseVideoRender: false,
  useMSE: false,
  useOffscreen: false,
  autoWasm: true, // Auto downgrade to WASM
  wasmDecodeErrorReplay: true,
  openWebglAlignment: false,
  wasmDecodeAudioSyncVideo: false,
  recordType: FILE_SUFFIX.webm,
  useWebFullScreen: false,
  loadingDecoderWorkerTimeout: 10,
  autoUseSystemFullScreen: true,
};

export const WORKER_CMD_TYPE = {
  init: "init",
  initVideo: "initVideo",
  render: "render",
  playAudio: "playAudio",
  initAudio: "initAudio",
  kBps: "kBps",
  decode: "decode",
  audioCode: "audioCode",
  videoCode: "videoCode",
  wasmError: "wasmError",
};

export const WASM_ERROR = {
  invalidNalUnitSize: "Invalid NAL unit size",
};

export const MEDIA_TYPE = {
  audio: 1,
  video: 2,
};

export const FLV_MEDIA_TYPE = {
  audio: 8,
  video: 9,
};

export const WORKER_SEND_TYPE = {
  init: "init",
  decode: "decode",
  audioDecode: "audioDecode",
  videoDecode: "videoDecode",
  close: "close",
  updateConfig: "updateConfig",
};

// Events
export const EVENTS = {
  fullscreen: "fullscreen$2",
  webFullscreen: "webFullscreen",
  decoderWorkerInit: "decoderWorkerInit",
  play: "play",
  playing: "playing",
  pause: "pause",
  mute: "mute",
  load: "load",
  loading: "loading",
  videoInfo: "videoInfo",
  timeUpdate: "timeUpdate",
  audioInfo: "audioInfo",
  log: "log",
  error: "error",
  kBps: "kBps",
  timeout: "timeout",
  delayTimeout: "delayTimeout",
  loadingTimeout: "loadingTimeout",
  stats: "stats",
  performance: "performance",
  record: "record",
  recording: "recording",
  recordingTimestamp: "recordingTimestamp",
  recordStart: "recordStart",
  recordEnd: "recordEnd",
  recordCreateError: "recordCreateError",
  buffer: "buffer",
  videoFrame: "videoFrame",
  start: "start",
  metadata: "metadata",
  resize: "resize",
  streamEnd: "streamEnd",
  streamSuccess: "streamSuccess",
  streamMessage: "streamMessage",
  streamError: "streamError",
  volumechange: "volumechange",
  volume: "volume",
  destroy: "destroy",
  mseSourceOpen: "mseSourceOpen",
  mseSourceClose: "mseSourceClose",
  mseSourceBufferError: "mseSourceBufferError",
  mseSourceBufferBusy: "mseSourceBufferBusy",
  mseSourceBufferFull: "mseSourceBufferFull",
  videoWaiting: "videoWaiting",
  videoTimeUpdate: "videoTimeUpdate",
  videoSyncAudio: "videoSyncAudio",
  playToRenderTimes: "playToRenderTimes",
};

export const CYPER_EVENTS = {
  load: EVENTS.load,
  timeUpdate: EVENTS.timeUpdate,
  videoInfo: EVENTS.videoInfo,
  audioInfo: EVENTS.audioInfo,
  error: EVENTS.error,
  kBps: EVENTS.kBps,
  log: EVENTS.log,
  start: EVENTS.start,
  timeout: EVENTS.timeout,
  loadingTimeout: EVENTS.loadingTimeout,
  delayTimeout: EVENTS.delayTimeout,
  fullscreen: "fullscreen",
  webFullscreen: EVENTS.webFullscreen,
  play: EVENTS.play,
  pause: EVENTS.pause,
  mute: EVENTS.mute,
  stats: EVENTS.stats,
  volumechange: EVENTS.volumechange,
  performance: EVENTS.performance,
  recordingTimestamp: EVENTS.recordingTimestamp,
  recordStart: EVENTS.recordStart,
  recordEnd: EVENTS.recordEnd,
  playToRenderTimes: EVENTS.playToRenderTimes,
  volume: EVENTS.volume,
};

export const EVENTS_ERROR = {
  playError: "playIsNotPauseOrUrlIsNull",
  fetchError: "fetchError",
  websocketError: "websocketError",
  webcodecsH265NotSupport: "webcodecsH265NotSupport",
  webcodecsConfigureError: "webcodecsConfigureError",
  webcodecsDecodeError: "webcodecsDecodeError",
  webcodecsWidthOrHeightChange: "webcodecsWidthOrHeightChange",
  mediaSourceH265NotSupport: "mediaSourceH265NotSupport",
  mediaSourceFull: EVENTS.mseSourceBufferFull,
  mseSourceBufferError: EVENTS.mseSourceBufferError,
  mediaSourceAppendBufferError: "mediaSourceAppendBufferError",
  mediaSourceBufferListLarge: "mediaSourceBufferListLarge",
  mediaSourceAppendBufferEndTimeout: "mediaSourceAppendBufferEndTimeout",
  wasmDecodeError: "wasmDecodeError",
  webglAlignmentError: "webglAlignmentError",
  webglContextLostError: "webglContextLostError",
  webglInitError: "webglInitError",
};

export const WEBSOCKET_STATUS = {
  notConnect: "notConnect",
  open: "open",
  close: "close",
  error: "error",
};

export const BUFFER_STATUS = {
  empty: "empty",
  buffering: "buffering",
  full: "full",
};

export const SCREENSHOT_TYPE = {
  download: "download",
  base64: "base64",
  blob: "blob",
};

export const VIDEO_ENC_TYPE = {
  7: "H264(AVC)",
  12: "H265(HEVC)",
};

export const VIDEO_ENC_CODE = {
  h264: 7,
  h265: 12,
};

export const AUDIO_ENC_TYPE = {
  10: "AAC",
  7: "ALAW",
  8: "MULAW",
};

export const H265_NAL_TYPE = {
  vps: 32,
  sps: 33,
  pps: 34,
};

export const CONTROL_HEIGHT = 38;

export const SCALE_MODE_TYPE = {
  full: 0,
  auto: 1,
  fullAuto: 2,
};

export const CANVAS_RENDER_TYPE = {
  webcodecs: "webcodecs",
  webgl: "webgl",
  offscreen: "offscreen",
};

export const ENCODED_VIDEO_TYPE = {
  key: "key",
  delta: "delta",
};

export const MP4_CODECS = {
  avc: 'video/mp4; codecs="avc1.64002A"',
  hev: 'video/mp4; codecs="hev1.1.6.L123.b0"',
};

export const MEDIA_SOURCE_STATE = {
  ended: "ended",
  open: "open",
  closed: "closed",
};

// frag duration
export const FRAG_DURATION = Math.ceil(1000 / 25);

export const AUDIO_SYNC_VIDEO_DIFF = 1000;

export const HOT_KEY = {
  esc: 27,
  arrowUp: 38,
  arrowDown: 40,
};

export const WCS_ERROR = {
  keyframeIsRequiredError:
    "A key frame is required after configure() or flush()",
  canNotDecodeClosedCodec: "Cannot call 'decode' on a closed codec",
};

export const FETCH_ERROR = {
  abortError1: "The user aborted a request",
  abortError2: "AbortError",
  abort: "AbortError",
};

export const FRAME_HEADER_EX = 0x80;

export const PACKET_TYPE_EX = {
  PACKET_TYPE_SEQ_START: 0,
  PACKET_TYPE_FRAMES: 1,
  PACKET_TYPE_FRAMESX: 3,
};

export const FRAME_TYPE_EX = {
  FT_KEY: 0x10,
  FT_INTER: 0x20,
};
