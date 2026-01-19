import Emitter from "../../utils/emitter";
import {EVENTS, EVENTS_ERROR, WCS_ERROR} from "../../constant";
import {formatVideoDecoderConfigure, isFalse, isTrue, supportMediaStreamTrack} from "../../utils";
import {parseAVCDecoderConfigurationRecord} from "../../utils/h264";
import {parseHEVCDecoderConfigurationRecord} from "../../utils/h265";

export default class WebcodecsDecoder extends Emitter {
    constructor(player) {
        super();
        this.player = player;
        this.decoder = null;
        this.init = false;
        this.hasInit = false;
        this.isDecodeFirst = false;
        this.player.debug.log('WebcodecsDecoder', 'init');
    }

    destroy() {
        if (this.decoder) {
            if (this.decoder.state !== 'closed') {
                this.decoder.close();
            }
            this.decoder = null;
        }
        this.init = false;
        this.hasInit = false;
        this.isDecodeFirst = false;
        this.off();
        this.player.debug.log('WebcodecsDecoder', 'destroy');
    }

    _initDecoder(msg) {
        const _opt = this.player._opt;
        const _this = this;
        this.decoder = new VideoDecoder({
            output: (videoFrame) => {
                if (!this.isDecodeFirst) {
                    this.player.debug.log('WebcodecsDecoder', 'first decode success');
                    this.isDecodeFirst = true;
                    //
                    if (this.player.video.trackGenerator) {
                        this.player.debug.log('WebcodecsDecoder', 'trackGenerator is true and emit play');
                        this.player.emit(EVENTS.play);
                    }
                }
                this.player.video.render({
                    videoFrame,
                    ts: videoFrame.timestamp
                });

                if (_opt.wcsUseVideoRender) {
                    //
                } else {
                    this.player.updateStats({fps: true, ts: videoFrame.timestamp, buf: 0});
                }
            },
            error: (e) => {
                this.player.debug.error('WebcodecsDecoder', 'decode error', e);
                this.player.emit(EVENTS.error, EVENTS_ERROR.webcodecsDecodeError);
                // reset
                this.destroy();
                this._initDecoder();
                this.player.emit(EVENTS.timeUpdate, 0);
            }
        });

        // H264
        if (msg.encTypeCode === 7) {
            const config = formatVideoDecoderConfigure(msg.avcC);
            this.decoder.configure(config);
            this.init = true;
        }
        // H265
        else if (msg.encTypeCode === 12) {
            //
            const config = {
                codec: msg.codec,
                description: msg.avcC
            };
            isTrue(isSupported(config)) && this.decoder.configure(config);
            this.init = true;
        }
    }

    decodeVideo(payload, ts, isIFrame) {
        if (!this.init) {
            // H264
            if (payload[0] === 0x17 && payload[1] === 0x00) {
                const avcC = payload.slice(5);
                const meta = parseAVCDecoderConfigurationRecord(avcC);
                this._initDecoder({
                    encTypeCode: 7,
                    avcC: avcC,
                    codec: meta.codec
                });
            }
            // H265
            else if (payload[0] === 0x1c && payload[1] === 0x00) {
                const avcC = payload.slice(5);
                const meta = parseHEVCDecoderConfigurationRecord(avcC);
                this._initDecoder({
                    encTypeCode: 12,
                    avcC: avcC,
                    codec: meta.codec
                });
            }
        } else {
            //
            if (this.decoder.state === 'closed') {
                return;
            }
            //
            if (isIFrame) {
                //
            }
            //
            const chunk = new EncodedVideoChunk({
                type: isIFrame ? 'key' : 'delta',
                timestamp: ts,
                data: payload
            });
            try {
                this.decoder.decode(chunk);
            } catch (e) {
                const error = e.toString();
                if (error.indexOf(WCS_ERROR.keyframeIsRequiredError) !== -1) {
                    this.player.debug.warn('WebcodecsDecoder', 'key frame is required');
                } else if (error.indexOf(WCS_ERROR.canNotDecodeClosedCodec) !== -1) {
                    this.player.debug.warn('WebcodecsDecoder', 'can not decode closed codec');
                } else {
                    this.player.debug.error('WebcodecsDecoder', 'decode error', e);
                }
            }
        }
    }
}


function isSupported(config) {
    return VideoDecoder.isConfigSupported(config).then((support) => {
        return support.supported;
    });
}
