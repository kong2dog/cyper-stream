import Emitter from "../../utils/emitter";
import {EVENTS, EVENTS_ERROR, MEDIA_SOURCE_STATE, MEDIA_SOURCE_UPDATE_END_TIMEOUT, MP4_CODECS} from "../../constant";
import MP4 from "../remux/mp4-generator";
import {formatMp4VideoCodec, formatVideoDecoderConfigure, isNotEmpty, supportMediaStreamTrack} from "../../utils";
import {parseAVCDecoderConfigurationRecord} from "../../utils/h264";

export default class MediaSourceDecoder extends Emitter {
    constructor(player) {
        super();
        this.player = player;
        this.mediaSource = new MediaSource();
        this.sourceBuffer = null;
        this.init = false;
        this.hasInit = false;
        this.isDecodeFirst = false;
        this.mediaSourceOpen = false;
        this.queue = [];
        this.isUpdating = false;
        this.player.debug.log('MediaSourceDecoder', 'init');
        //
        this.mediaSource.addEventListener('sourceopen', () => {
            this.player.debug.log('MediaSourceDecoder', 'sourceopen');
            this.mediaSourceOpen = true;
            this.player.emit(EVENTS.mseSourceOpen);
        });

        this.mediaSource.addEventListener('sourceclose', () => {
            this.player.debug.log('MediaSourceDecoder', 'sourceclose');
            this.mediaSourceOpen = false;
            this.player.emit(EVENTS.mseSourceClose);
        });

        player.video.$videoElement.src = URL.createObjectURL(this.mediaSource);
    }

    destroy() {
        if (this.mediaSource) {
            if (this.mediaSource.readyState === MEDIA_SOURCE_STATE.open) {
                this.mediaSource.endOfStream();
            }
            this.mediaSource = null;
        }
        if (this.sourceBuffer) {
            this.sourceBuffer.abort();
            this.sourceBuffer = null;
        }
        this.init = false;
        this.hasInit = false;
        this.isDecodeFirst = false;
        this.mediaSourceOpen = false;
        this.queue = [];
        this.isUpdating = false;
        this.off();
        this.player.debug.log('MediaSourceDecoder', 'destroy');
    }

    _initDecoder(msg) {
        const _opt = this.player._opt;
        const mimeType = formatMp4VideoCodec(msg.codec);
        this.player.debug.log('MediaSourceDecoder', `initDecoder mimeType:${mimeType}`);
        if (MediaSource.isTypeSupported(mimeType)) {
            this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
            this.sourceBuffer.addEventListener('updateend', () => {
                // this.player.debug.log('MediaSourceDecoder', 'updateend');
                this.isUpdating = false;
                if (this.queue.length) {
                    const buffer = this.queue.shift();
                    this._appendBuffer(buffer);
                }
            });
            this.sourceBuffer.addEventListener('error', (e) => {
                this.player.debug.error('MediaSourceDecoder', 'sourceBuffer error', e);
                this.player.emit(EVENTS.mseSourceBufferError, e);
            });
            this.init = true;
        } else {
            this.player.debug.error('MediaSourceDecoder', `isTypeSupported false mimeType:${mimeType}`);
            this.player.emit(EVENTS_ERROR.mediaSourceH265NotSupport);
        }
    }

    decodeVideo(payload, ts, isIFrame, cts) {
        if (!this.mediaSourceOpen) {
            return;
        }

        if (!this.init) {
            // H264
            if (payload[0] === 0x17 && payload[1] === 0x00) {
                const avcC = payload.slice(5);
                const meta = parseAVCDecoderConfigurationRecord(avcC);
                meta.id = 1;
                meta.timescale = 1000;
                meta.duration = 0;
                meta.avcc = avcC;
                meta.codecWidth = meta.codecWidth || this.player.width;
                meta.codecHeight = meta.codecHeight || this.player.height;
                meta.presentWidth = meta.presentWidth || this.player.width;
                meta.presentHeight = meta.presentHeight || this.player.height;

                this._initDecoder({
                    encTypeCode: 7,
                    codec: meta.codec
                });
                // init segment
                const initSegment = MP4.generateInitSegment(meta);
                this._appendBuffer(initSegment);
            }
        } else {
            //
            const data = payload.slice(5);
            //
            const moof = MP4.moof({
                id: 1,
                sequenceNumber: 0,
                duration: 40, // 25fps
                size: data.byteLength,
                flags: {
                    isLeading: 0,
                    dependsOn: isIFrame ? 2 : 1,
                    isDependedOn: 0,
                    hasRedundancy: 0,
                    isNonSync: isIFrame ? 0 : 1
                },
                cts: cts
            }, ts);
            
            const mdat = MP4.mdat(data);
            const buffer = new Uint8Array(moof.byteLength + mdat.byteLength);
            buffer.set(moof, 0);
            buffer.set(mdat, moof.byteLength);
            this._appendBuffer(buffer);
        }
    }

    _appendBuffer(buffer) {
        if (this.sourceBuffer && !this.sourceBuffer.updating && !this.isUpdating) {
            try {
                this.isUpdating = true;
                this.sourceBuffer.appendBuffer(buffer);
            } catch (e) {
                this.isUpdating = false;
                this.player.debug.error('MediaSourceDecoder', 'appendBuffer error', e);
                this.player.emit(EVENTS.mseSourceBufferError, e);
            }
        } else {
            this.queue.push(buffer);
        }
    }
    
    getSourceBufferUpdating(){
        return this.sourceBuffer && this.sourceBuffer.updating;
    }
}
