import Emitter from "../../utils/emitter";
import { AUDIO_ENC_TYPE, EVENTS } from "../../constant";
import { audioContextUnlock, isFalse, isTrue } from "../../utils";

export default class AudioContextLoader extends Emitter {
  constructor(player) {
    super();
    this.player = player;
    this.audioContext = null;
    this.gainNode = null;
    this.playing = false;
    this.audioInfo = {
      encType: "",
      channels: "",
      sampleRate: "",
    };
    this.scriptNode = null;
    this.audioBufferList = [];
    this.audioEnabled = true;
    this.audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = 0.5;
    this.init();
    this.player.debug.log("Audio", "init");
  }

  init() {
    if (this.audioContext.state === "suspended") {
      audioContextUnlock(this.audioContext);
    }
    this.audioEnabled = true;
  }

  destroy() {
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.audioBufferList = [];
    this.playing = false;
    this.off();
    this.player.debug.log("Audio", "destroy");
  }

  updateAudioInfo(data) {
    if (data.codecId) {
      // 临时处理，兼容 flvLoader 传来的 codecId
      if (data.codecId === 7) this.audioInfo.encType = "ALAW";
    } else if (data.encTypeCode) {
      this.audioInfo.encType = AUDIO_ENC_TYPE[data.encTypeCode];
    }

    if (data.channels) {
      this.audioInfo.channels = data.channels;
    }

    if (data.sampleRate) {
      this.audioInfo.sampleRate = data.sampleRate;
    }
    //
    if (
      this.audioInfo.encType &&
      this.audioInfo.channels &&
      this.audioInfo.sampleRate
    ) {
      this.player.emit(EVENTS.audioInfo, this.audioInfo);

      // 初始化 scriptNode
      if (!this.scriptNode) {
        this.initScriptNode({ channels: this.audioInfo.channels });
      }
    }
  }

  initScriptNode(msg) {
    if (!msg) {
      return;
    }
    //
    const channels = msg.channels;
    // 使用 2048 缓冲区大小
    const bufferSize = 2048;
    const scriptNode = this.audioContext.createScriptProcessor(
      bufferSize,
      0,
      channels,
    );

    // 音频重采样缓冲区
    this._leftOverBuffer = null;

    scriptNode.onaudioprocess = (audioProcessingEvent) => {
      const outputBuffer = audioProcessingEvent.outputBuffer;
      const outputData = outputBuffer.getChannelData(0); // Assuming mono for ALAW 8000Hz usually

      // 简单逻辑：从 audioBufferList 取数据填充
      // 实际 ALAW (8000Hz) -> AudioContext (44100/48000Hz) 需要重采样
      // 这里我们先用最简单的线性插值或零阶保持来做演示，或者依赖浏览器自动处理（如果是 buffer source）
      // 但 scriptProcessor 需要我们自己填数据。

      // 由于 PCM 数据块大小不一定等于 bufferSize，我们需要一个环形缓冲或简单的剩余缓冲
      let requiredSamples = bufferSize;
      let outputIndex = 0;

      // 1. 先填充上次剩余的
      if (this._leftOverBuffer && this._leftOverBuffer.length > 0) {
        const take = Math.min(this._leftOverBuffer.length, requiredSamples);
        for (let i = 0; i < take; i++) {
          outputData[outputIndex++] = this._leftOverBuffer[i];
        }
        if (take < this._leftOverBuffer.length) {
          this._leftOverBuffer = this._leftOverBuffer.subarray(take);
          return; // 填满了
        } else {
          this._leftOverBuffer = null;
        }
      }

      // 2. 从队列取新数据
      while (outputIndex < bufferSize && this.audioBufferList.length > 0) {
        const bufferItem = this.audioBufferList.shift();
        const buffer = bufferItem.data || bufferItem; // 兼容不同结构

        // 简单的重采样：如果源是 8000，目标是 48000，需要 6 倍插值
        // 为了简化，我们假设 audioBufferList 里的数据已经是通过某种方式（虽然我们上面只是解码）
        // 实际上 decodeALaw 出来的是 8000Hz 的 float32。
        // 我们需要在这里做即时重采样

        const sourceRate = this.audioInfo.sampleRate || 8000;
        const targetRate = this.audioContext.sampleRate;
        const ratio = sourceRate / targetRate;

        // 这里的逻辑比较复杂，为了快速修复，我们先直接填充，这会导致音调变高（加速）
        // 必须实现一个简单的线性插值重采样

        // 实际上 flvLoader 传过来的是 Float32Array (8000Hz)
        // 我们需要生成 targetRate 的数据

        const inputData = buffer;
        const inputLength = inputData.length;

        // 计算输出长度
        const outputLength = Math.ceil(inputLength / ratio);

        // 简单的重采样逻辑
        // 这里我们暂且直接把数据塞进去（如果采样率不匹配，声音会变），
        // 更好的做法是引入 Resampler，但为了不引入外部庞大库，我们做一个简单的 Nearest Neighbor

        let inputIndex = 0;
        while (outputIndex < bufferSize && inputIndex < inputLength) {
          // 这是一个极其简化的逻辑，实际上我们需要维护 inputIndex 的小数部分
          // 暂时不做复杂重采样，直接拷贝（会有变速问题）
          // 修正：G711通常是8000Hz，Context是44.1k/48k。直接拷贝会快放5-6倍。
          // 必须插值。

          // 线性插值
          // 实际上我们应该把重采样放在 playPcm 里做，或者这里。
          // 让我们修改 playPcm 方法来预处理，或者在这里处理

          // 为了稳定性，我们先假设外部已经做了重采样或者我们在这里做
          // 由于不能引入大库，我们用简单的重复填充

          // 真正的修复：
          // 我们在 playPcm 里接收 8000Hz 数据，但是在这里输出时，AudioContext 会按它的 sampleRate 播放
          // 所以我们需要提供足够多的样本。

          // 让我们把这个复杂逻辑简化：使用 createBufferSource 播放片段，而不是 ScriptProcessor
          // ScriptProcessor 适合流式，但处理采样率麻烦。
          // 改用 BufferSource 方案？不，那样会不连续。

          // 回到 ScriptProcessor。
          // 我们需要在 push 到 audioBufferList 之前就重采样好。
          // 所以修改 playPcm 方法更好。

          outputData[outputIndex++] = inputData[Math.floor(inputIndex)];
          // inputIndex += ratio; // 错误，ratio < 1 (8000/48000 = 0.16)
          // 应该是 inputIndex += (sourceRate / targetRate) ?
          // 不，如果 source 8k, target 48k, 每 1 个 source 样本对应 6 个 target 样本
          // step = 8000 / 48000 = 0.1666

          // 我们还是直接拷贝吧，先确保存入逻辑是对的
          inputIndex++;
        }

        // 处理剩余
        if (inputIndex < inputLength) {
          this._leftOverBuffer = inputData.subarray(inputIndex);
        }
      }
    };
    scriptNode.connect(this.gainNode);
    this.scriptNode = scriptNode;
  }

  /**
   * 播放 PCM 数据 (Float32Array)
   * 包含简单的重采样逻辑 (Linear Interpolation) 以适配 AudioContext 采样率
   * @param {Float32Array} pcmData - 原始 PCM 数据
   * @param {number} ts - 时间戳
   */
  playPcm(pcmData, ts) {
    if (!this.audioEnabled || this.audioContext.state === "suspended") {
      if (this.audioContext.state === "suspended") this.audioContext.resume();
    }

    const sourceRate = this.audioInfo.sampleRate || 8000;
    const targetRate = this.audioContext.sampleRate;

    if (sourceRate === targetRate) {
      this.audioBufferList.push(pcmData);
      return;
    }

    // 简单的线性插值重采样
    const ratio = sourceRate / targetRate;
    const outputLength = Math.round(pcmData.length / ratio);
    const resampledData = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const decimal = position - index;

      const p1 = pcmData[index];
      const p2 = index + 1 < pcmData.length ? pcmData[index + 1] : p1;

      resampledData[i] = p1 + (p2 - p1) * decimal;
    }

    this.audioBufferList.push(resampledData);

    // 限制缓冲大小
    if (this.audioBufferList.length > 50) {
      this.audioBufferList.shift();
    }
  }

  play(buffer, ts) {
    if (!this.audioEnabled) {
      return;
    }
    //
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }

    if (this.audioBufferList.length > 20) {
      this.audioBufferList = [];
    }

    this.audioBufferList.push(buffer);
  }

  setVolume(volume) {
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
  }

  getVolume() {
    if (this.gainNode) {
      return this.gainNode.gain.value;
    }
    return 0;
  }

  mute(flag) {
    if (isTrue(flag)) {
      this.setVolume(0);
      this.audioEnabled = false;
    } else {
      this.setVolume(0.5);
      this.audioEnabled = true;
    }
  }

  isStateSuspended() {
    return this.audioContext.state === "suspended";
  }

  get hasAudio() {
    return this.audioEnabled;
  }
}
