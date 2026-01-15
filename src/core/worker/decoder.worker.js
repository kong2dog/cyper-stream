import { FLVDemuxer } from '../demux/flv-demuxer.js';
import { logger } from '../../utils/logger.js';

/**
 * 视频解码 Worker
 * @author kong2dog
 */

let demuxer;
let videoDecoder;
let canvasCtx;
let offscreenCanvas;
let abortController;

self.onmessage = async (e) => {
    const { type, payload } = e.data;
    switch (type) {
        case 'init':
            if (payload.canvas) {
                offscreenCanvas = payload.canvas;
                // 为了简单起见使用 2d 上下文，或者使用 webgl 以获得更好的性能
                // 对于高性能播放器，在现代浏览器中，使用 2d 上下文的 drawImage(VideoFrame) 是经过硬件加速的。
                canvasCtx = offscreenCanvas.getContext('2d'); 
            }
            initDecoder();
            break;
        case 'connect':
            connect(payload.url);
            break;
        case 'close':
            if (abortController) abortController.abort();
            if (videoDecoder) {
                if (videoDecoder.state !== 'closed') videoDecoder.close();
            }
            break;
    }
};

function initDecoder() {
    videoDecoder = new VideoDecoder({
        output: (frame) => {
            if (canvasCtx) {
                // 如果需要，调整 canvas 大小以匹配帧
                if (offscreenCanvas.width !== frame.displayWidth || offscreenCanvas.height !== frame.displayHeight) {
                    offscreenCanvas.width = frame.displayWidth;
                    offscreenCanvas.height = frame.displayHeight;
                }
                // 渲染到 OffscreenCanvas
                canvasCtx.drawImage(frame, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
                frame.close();
            } else {
                frame.close();
            }
        },
        error: (e) => logger.error('解码器错误', e)
    });
}

async function connect(url) {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    
    demuxer = new FLVDemuxer((type, data, timestamp) => {
        if (type === 'video') {
            handleVideo(data, timestamp);
        }
    });

    try {
        const response = await fetch(url, { signal: abortController.signal });
        if (!response.body) throw new Error('无响应体');
        
        const reader = response.body.getReader();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            demuxer.append(value);
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            logger.error('Fetch 错误', err);
        }
    }
}

function handleVideo(data, timestamp) {
    // FLV 视频数据解析
    // Tag body: FrameType(4) + CodecID(4)
    if (data.length < 5) return;

    const frameType = (data[0] & 0xF0) >> 4; // 1: 关键帧, 2: 帧间预测
    const codecId = data[0] & 0x0F;

    if (codecId === 7) { // AVC
        const packetType = data[1]; // 0: AVCC 头, 1: NALU
        const cts = ((data[2] << 16) | (data[3] << 8) | data[4]); // 组合时间
        
        // 载荷从偏移量 5 开始
        const payload = data.slice(5);

        if (packetType === 0) {
            // AVCDecoderConfigurationRecord
            try {
                const config = parseAVCC(payload);
                if (config && videoDecoder.state === 'configured' || videoDecoder.state === 'unconfigured') {
                    videoDecoder.configure(config);
                    logger.info('VideoDecoder 已配置', config.codec);
                }
            } catch (e) {
                logger.error('配置错误', e);
            }
        } else if (packetType === 1) {
            // NALU
            if (videoDecoder.state !== 'configured') return;

            const chunk = new EncodedVideoChunk({
                type: frameType === 1 ? 'key' : 'delta',
                timestamp: timestamp * 1000, // 微秒
                duration: 0,
                data: payload
            });
            videoDecoder.decode(chunk);
        }
    }
}

function parseAVCC(data) {
    // data 是 AVCDecoderConfigurationRecord
    // [0] 版本
    // [1] profile
    // [2] profile 兼容性
    // [3] level
    // ...
    
    if (data.length < 4) return null;
    
    const version = data[0];
    const profile = data[1];
    const compatibility = data[2];
    const level = data[3];
    
    // 构建 codec 字符串: avc1.PPCCLL
    const codec = `avc1.${toHex(profile)}${toHex(compatibility)}${toHex(level)}`;
    
    return {
        codec: codec,
        description: data
    };
}

function toHex(v) {
    return v.toString(16).padStart(2, '0');
}
