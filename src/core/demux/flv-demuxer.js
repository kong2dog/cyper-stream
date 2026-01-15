import { logger } from '../../utils/logger.js';

/**
 * FLV 协议解复用器
 * @author kong2dog
 */
export class FLVDemuxer {
    constructor(onPacket) {
        this.onPacket = onPacket; // 回调函数 (type, payload, timestamp)
        this.buffer = new Uint8Array(0);
        this.offset = 0;
        this.hasHeader = false;
    }

    append(chunk) {
        // 将新数据块追加到缓冲区
        const newBuffer = new Uint8Array(this.buffer.length + chunk.length);
        newBuffer.set(this.buffer);
        newBuffer.set(chunk, this.buffer.length);
        this.buffer = newBuffer;
        
        this.parse();
    }

    parse() {
        if (!this.hasHeader) {
            if (this.buffer.length < 9) return;
            // 检查签名 'FLV'
            if (this.buffer[0] !== 0x46 || this.buffer[1] !== 0x4C || this.buffer[2] !== 0x56) {
                logger.error('无效的 FLV 签名');
                return;
            }
            // 跳过头信息
            this.offset = 9; // 头长度
            this.offset += 4; // PreviousTagSize0
            this.hasHeader = true;
        }

        while (this.offset + 11 <= this.buffer.length) {
            const type = this.buffer[this.offset];
            const dataSize = (this.buffer[this.offset + 1] << 16) | 
                             (this.buffer[this.offset + 2] << 8) | 
                             this.buffer[this.offset + 3];
            
            const timestamp = (this.buffer[this.offset + 4] << 16) | 
                              (this.buffer[this.offset + 5] << 8) | 
                              this.buffer[this.offset + 6] | 
                              (this.buffer[this.offset + 7] << 24); // 扩展时间戳

            const totalTagSize = 11 + dataSize + 4; // 头 + 数据 + PreviousTagSize

            if (this.offset + totalTagSize > this.buffer.length) {
                // 数据不足以构成完整的 tag
                break;
            }

            // 提取数据
            const data = this.buffer.slice(this.offset + 11, this.offset + 11 + dataSize);
            
            this.processTag(type, data, timestamp);

            this.offset += totalTagSize;
        }

        // 压缩缓冲区
        if (this.offset > 0) {
            this.buffer = this.buffer.slice(this.offset);
            this.offset = 0;
        }
    }

    processTag(type, data, timestamp) {
        // 类型: 8 = 音频, 9 = 视频, 18 = 脚本
        if (type === 9) {
            this.onPacket('video', data, timestamp);
        } else if (type === 8) {
            this.onPacket('audio', data, timestamp);
        }
    }
}
