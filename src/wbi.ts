/* eslint-disable @typescript-eslint/no-namespace */
import { Context, Schema, Service } from "koishi";
import md5 from 'md5'
import crypto from 'crypto'

declare module 'koishi' {
    interface Context {
        wbi: Wbi
    }
}

class Wbi extends Service {
    wbiConfig: Wbi.Config
    mixinKeyEncTab = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
        33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
        61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
        36, 20, 34, 44, 52
    ]

    constructor(ctx: Context, config: Wbi.Config) {
        super(ctx, 'wbi')
        this.wbiConfig = config
    }

    /* protected start(): void | Promise<void> {
        this.logger.info('工作中')
    }

    protected stop(): void | Promise<void> {
        this.logger.info('已停止工作')
    } */

    // 对 imgKey 和 subKey 进行字符顺序打乱编码
    getMixinKey = (orig) => this.mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32)

    // 为请求参数进行 wbi 签名
    encWbi(params, img_key, sub_key) {
        const mixin_key = this.getMixinKey(img_key + sub_key),
            curr_time = Math.round(Date.now() / 1000),
            chr_filter = /[!'()*]/g

        Object.assign(params, { wts: curr_time }) // 添加 wts 字段
        // 按照 key 重排参数
        const query = Object
            .keys(params)
            .sort()
            .map(key => {
                // 过滤 value 中的 "!'()*" 字符
                const value = params[key].toString().replace(chr_filter, '')
                return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
            })
            .join('&')

        const wbi_sign = md5(query + mixin_key) // 计算 w_rid

        return query + '&w_rid=' + wbi_sign
    }

    // 获取最新的 img_key 和 sub_key
    async getWbiKeys() {
        const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
            headers: {
                // SESSDATA 字段
                Cookie: "SESSDATA=xxxxxx"
            }
        })
        const { data: { wbi_img: { img_url, sub_url } } } = await res.json()

        return {
            img_key: img_url.slice(
                img_url.lastIndexOf('/') + 1,
                img_url.lastIndexOf('.')
            ),
            sub_key: sub_url.slice(
                sub_url.lastIndexOf('/') + 1,
                sub_url.lastIndexOf('.')
            )
        }
    }

    async getWbi(params) {
        const web_keys = await this.getWbiKeys()
        const img_key = web_keys.img_key,
            sub_key = web_keys.sub_key
        const query = this.encWbi(params, img_key, sub_key)
        return query
    }

    encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.wbiConfig.key), iv);
        const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    decrypt(text: string): string {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.wbiConfig.key), iv);
        const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
        return decrypted.toString();
    }
}

namespace Wbi {
    export interface Config {
        key: string
    }

    export const Config: Schema<Config> = Schema.object({
        key: Schema.string()
            .pattern(/^[0-9a-f]{32}$/)
            .required()
    })
}

export default Wbi