import Emitter from "../../utils/emitter";
import {AUDIO_ENC_TYPE, EVENTS} from "../../constant";
import {audioContextUnlock, isFalse, isTrue} from "../../utils";

export default class AudioContextLoader extends Emitter {
    constructor(player) {
        super();
        this.player = player;
        this.audioContext = null;
        this.gainNode = null;
        this.playing = false;
        this.audioInfo = {
            encType: '',
            channels: '',
            sampleRate: ''
        };
        this.scriptNode = null;
        this.audioBufferList = [];
        this.audioEnabled = true;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        this.gainNode.gain.value = 0.5;
        this.init();
        this.player.debug.log('Audio', 'init');
    }

    init() {
        if (this.audioContext.state === 'suspended') {
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
        this.player.debug.log('Audio', 'destroy');
    }

    updateAudioInfo(data) {
        if (data.encTypeCode) {
            this.audioInfo.encType = AUDIO_ENC_TYPE[data.encTypeCode];
        }

        if (data.channels) {
            this.audioInfo.channels = data.channels;
        }

        if (data.sampleRate) {
            this.audioInfo.sampleRate = data.sampleRate;
        }
        //
        if (this.audioInfo.encType && this.audioInfo.channels && this.audioInfo.sampleRate) {
            this.player.emit(EVENTS.audioInfo, this.audioInfo);
        }
    }


    initScriptNode(msg) {
        if (!msg) {
            return;
        }
        //
        const channels = msg.channels;
        const scriptNode = this.audioContext.createScriptProcessor(2048, 0, channels);
        scriptNode.onaudioprocess = (audioProcessingEvent) => {
            const outputBuffer = audioProcessingEvent.outputBuffer;
            if (this.audioBufferList.length) {
                const buffer = this.audioBufferList.shift();
                if (buffer) {
                    for (let channel = 0; channel < channels; channel++) {
                        const b = buffer[channel];
                        const nowBuffering = outputBuffer.getChannelData(channel);
                        for (let i = 0; i < 2048; i++) {
                            nowBuffering[i] = b[i] || 0;
                        }
                    }
                }
            }
        };
        scriptNode.connect(this.gainNode);
        this.scriptNode = scriptNode;
    }

    play(buffer, ts) {
        if (!this.audioEnabled) {
            return;
        }
        //
        if (this.audioContext.state === 'suspended') {
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
        return this.audioContext.state === 'suspended';
    }

    get hasAudio() {
        return this.audioEnabled;
    }
}
