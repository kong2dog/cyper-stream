
/**
 * 签名工具类
 * 对应 Java 版本的签名生成逻辑
 */

/**
 * 将 UTF-8 字符串转换为 Base64
 * 解决 window.btoa 不支持 Unicode 字符的问题
 * @param {string} str 
 * @returns {string}
 */
function utf8_to_b64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
}

/**
 * 计算 HMAC-SHA256
 * @param {string} message 消息内容
 * @param {string} secret 密钥
 * @returns {Promise<string>} 十六进制大写签名
 */
async function hmacSha256(message, secret) {
    const enc = new TextEncoder();
    const algorithm = { name: "HMAC", hash: "SHA-256" };
    
    const key = await window.crypto.subtle.importKey(
        "raw", 
        enc.encode(secret), 
        algorithm, 
        false, 
        ["sign"]
    );
    
    const signature = await window.crypto.subtle.sign(
        algorithm.name, 
        key, 
        enc.encode(message)
    );
    
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

/**
 * 生成签名
 * @param {Object} params 参数对象 (Map<String, Object>)
 * @param {string} appkey 应用密钥
 * @returns {Promise<{sign: string, timestamp: number}>} 包含签名和时间戳的对象
 */
export async function generateSignature(params, appkey) {
    // 1. 参数按键名的ASCII码升序排序
    const sortedKeys = Object.keys(params).sort();

    // 2. 生成签名原串
    // Java代码逻辑：String stringA = formatUrlMap(data, false, false);
    // Java代码逻辑：String stringSignTemp = URLDecoder.decode(stringA, "utf-8") + ...
    // 这意味着参与签名的部分是原始的键值对字符串，没有经过URL编码
    const stringA = sortedKeys
        .filter(k => params[k] !== null && params[k] !== undefined) // 过滤空值
        .map(k => `${k}=${params[k]}`)
        .join('&');

    // 3. 获取当前时间戳 (秒)
    const timestamp = Math.floor(Date.now() / 1000);

    // 4. 拼接签名字符串
    // stringSignTemp = stringA + "&appkey=" + appkey + "&timestamp=" + timestamp
    const stringSignTemp = `${stringA}&appkey=${appkey}&timestamp=${timestamp}`;

    // 5. Base64 编码
    const stringBase64 = utf8_to_b64(stringSignTemp);

    // 6. HMAC-SHA256 生成签名
    const sign = await hmacSha256(stringBase64, appkey);

    return {
        sign,
        timestamp
    };
}
