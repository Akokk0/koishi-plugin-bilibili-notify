/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, Schema, Service } from "koishi"
import md5 from 'md5'
import crypto from 'crypto'
import axios from 'axios'
import { CookieJar, Cookie } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { JSDOM } from 'jsdom'
import { Notifier } from "@koishijs/plugin-notifier"
import { DateTime } from "luxon"

declare module 'koishi' {
    interface Context {
        ba: BiliAPI
    }
}

const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
]

// 在getUserInfo中检测到番剧出差的UID时，要传回的数据：
const bangumiTripData = { "code": 0, "data": { "live_room": { "roomid": 931774 } } }

const GET_USER_SPACE_DYNAMIC_LIST = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space'
const GET_ALL_DYNAMIC_LIST = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all'
const HAS_NEW_DYNAMIC = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all/update'
const GET_COOKIES_INFO = 'https://passport.bilibili.com/x/passport-login/web/cookie/info'
const GET_USER_INFO = 'https://api.bilibili.com/x/space/wbi/acc/info'
const GET_MYSELF_INFO = 'https://api.bilibili.com/x/member/web/account'
const GET_LOGIN_QRCODE = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate'
const GET_LOGIN_STATUS = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll'
const GET_LIVE_ROOM_INFO = 'https://api.live.bilibili.com/room/v1/Room/get_info'
const GET_MASTER_INFO = 'https://api.live.bilibili.com/live_user/v1/Master/info'
const GET_TIME_NOW = 'https://api.bilibili.com/x/report/click/now'
const GET_SERVER_UTC_TIME = 'https://interface.bilibili.com/serverdate.js'

// 最近更新UP
const GET_LATEST_UPDATED_UPS = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/portal'

// 操作
const MODIFY_RELATION = 'https://api.bilibili.com/x/relation/modify'
const CREATE_GROUP = 'https://api.bilibili.com/x/relation/tag/create'
const MODIFY_GROUP_MEMBER = 'https://api.bilibili.com/x/relation/tags/addUsers'
const GET_ALL_GROUP = 'https://api.bilibili.com/x/relation/tags'
const COPY_USER_TO_GROUP = 'https://api.bilibili.com/x/relation/tags/copyUsers'
const GET_RELATION_GROUP_DETAIL = 'https://api.bilibili.com/x/relation/tag'

// 直播
const GET_LIVE_ROOM_INFO_STREAM_KEY = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo'

class BiliAPI extends Service {
    static inject = ['database', 'notifier']

    jar: CookieJar
    client: any
    apiConfig: BiliAPI.Config
    loginData: any
    loginNotifier: Notifier
    refreshCookieTimer: Function
    loginInfoIsLoaded: boolean = false

    constructor(ctx: Context, config: BiliAPI.Config) {
        super(ctx, 'ba')
        this.apiConfig = config
    }

    protected start(): void | Promise<void> {
        // 创建新的http客户端(axios)
        this.createNewClient()
        // 从数据库加载cookies
        this.loadCookiesFromDatabase()
    }

    // WBI签名
    // 对 imgKey 和 subKey 进行字符顺序打乱编码
    getMixinKey = (orig: string) =>
        mixinKeyEncTab
            .map((n) => orig[n])
            .join("")
            .slice(0, 32);

    // 为请求参数进行 wbi 签名
    encWbi(
        params: { [key: string]: string | number | object },
        img_key: string,
        sub_key: string
    ) {
        const mixin_key = this.getMixinKey(img_key + sub_key),
            curr_time = Math.round(Date.now() / 1000),
            chr_filter = /[!'()*]/g;

        Object.assign(params, { wts: curr_time }); // 添加 wts 字段
        // 按照 key 重排参数
        const query = Object.keys(params)
            .sort()
            .map((key) => {
                // 过滤 value 中的 "!'()*" 字符
                const value = params[key].toString().replace(chr_filter, "");
                return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
            })
            .join("&");

        const wbi_sign = md5(query + mixin_key); // 计算 w_rid

        return query + "&w_rid=" + wbi_sign;
    }

    async getWbi(
        params: { [key: string]: string | number | object },
    ) {
        const web_keys = await this.getWbiKeys()
        const img_key = web_keys.img_key,
            sub_key = web_keys.sub_key
        const query = this.encWbi(params, img_key, sub_key)
        return query
    }

    encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.apiConfig.key), iv);
        const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    decrypt(text: string): string {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.apiConfig.key), iv);
        const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
        return decrypted.toString();
    }

    // BA API

    async getLatestUpdatedUPs() {
        try {
            // 获取直播间信息流密钥
            const { data } = await this.client.get(GET_LATEST_UPDATED_UPS)
            // 返回data
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getLiveRoomInfoStreamKey(roomId: string) {
        try {
            // 获取直播间信息流密钥
            const { data } = await this.client.get(`${GET_LIVE_ROOM_INFO_STREAM_KEY}?id=${roomId}`)
            // 返回data
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getServerUTCTime() {
        try {
            const { data } = await this.client.get(GET_SERVER_UTC_TIME);
            const regex = /Date\.UTC\((.*?)\)/;
            const match = data.match(regex);
            if (match) {
                const timestamp = new Function(`return Date.UTC(${match[1]})`)();
                return timestamp / 1000;
            } else {
                throw new Error('解析服务器时间失败！');
            }
        } catch (e) {
            throw new Error('网络异常，本次请求失败！');
        }
    }

    async getTimeNow() {
        try {
            const { data } = await this.client.get(GET_TIME_NOW)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getAllGroup() {
        try {
            const { data } = await this.client.get(GET_ALL_GROUP)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async removeUserFromGroup(mid: string) {
        // 获取csrf
        const csrf = this.getCSRF()
        try {
            // 将用户mid添加到groupId
            const { data } = await this.client.post(MODIFY_GROUP_MEMBER, {
                fids: mid,
                tagids: 0,
                csrf
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            })
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async copyUserToGroup(mid: string, groupId: string) {
        // 获取csrf
        const csrf = this.getCSRF()
        try {
            // 将用户mid添加到groupId
            const { data } = await this.client.post(COPY_USER_TO_GROUP, {
                fids: mid,
                tagids: groupId,
                csrf
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            })
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getUserSpaceDynamic(mid: string) {
        try {
            const { data } = await this.client.get(`${GET_USER_SPACE_DYNAMIC_LIST}?host_mid=${mid}`)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async createGroup(tag: string) {
        try {
            const { data } = await this.client.post(CREATE_GROUP, {
                tag,
                csrf: this.getCSRF()
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            })
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getAllDynamic(updateBaseline?: string) {
        let url = GET_ALL_DYNAMIC_LIST
        updateBaseline && (url += `?update_baseline=${updateBaseline}`)
        try {
            const { data } = await this.client.get(url)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async hasNewDynamic(updateBaseline: string) {
        try {
            const { data } = await this.client.get(`${HAS_NEW_DYNAMIC}?update_baseline=${updateBaseline}`)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async follow(fid: string) {
        try {
            const { data } = await this.client.post(MODIFY_RELATION, {
                fid,
                act: 1,
                re_src: 11,
                csrf: this.getCSRF()
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            })
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getRelationGroupDetail(tagid: string) {
        try {
            const { data } = await this.client.get(`${GET_RELATION_GROUP_DETAIL}?tagid=${tagid}`)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    // Check if Token need refresh
    async getCookieInfo(refreshToken: string) {
        try {
            const { data } = await this.client.get(`${GET_COOKIES_INFO}?csrf=${refreshToken}`)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getUserInfo(mid: string) {
        //如果为番剧出差的UID，则不从远程接口拉取数据，直接传回一段精简过的有效数据
        if (mid === "11783021") {
            console.log("检测到番剧出差UID，跳过远程用户接口访问")
            return bangumiTripData
        }
        try {
            const wbi = await this.getWbi({ mid })
            const { data } = await this.client.get(`${GET_USER_INFO}?${wbi}`)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    // 获取最新的 img_key 和 sub_key
    async getWbiKeys() {
        const { data } = await this.client.get('https://api.bilibili.com/x/web-interface/nav')
        const {
            data: {
                wbi_img: { img_url, sub_url },
            },
        } = data

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

    async getMyselfInfo() {
        try {
            const { data } = await this.client.get(GET_MYSELF_INFO)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getLoginQRCode() {
        try {
            const { data } = await this.client.get(GET_LOGIN_QRCODE)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getLoginStatus(qrcodeKey: string) {
        try {
            const { data } = await this.client.get(`${GET_LOGIN_STATUS}?qrcode_key=${qrcodeKey}`)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getLiveRoomInfo(roomId: string) {
        try {
            const { data } = await this.client.get(`${GET_LIVE_ROOM_INFO}?room_id=${roomId}`)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    async getMasterInfo(mid: string) {
        try {
            const { data } = await this.client.get(`${GET_MASTER_INFO}?uid=${mid}`)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
        }
    }

    disposeNotifier() { if (this.loginNotifier) this.loginNotifier.dispose() }

    getRandomUserAgent() {
        const userAgents = [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
        ];

        const index = Math.floor(Math.random() * userAgents.length);
        return userAgents[index];
    }

    createNewClient() {
        this.jar = new CookieJar()
        this.client = wrapper(axios.create({
            jar: this.jar,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':
                    this.apiConfig.userAgent !== 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' ?
                        this.apiConfig.userAgent : this.getRandomUserAgent(),
                'Origin': 'https://www.bilibili.com',
                'Referer': 'https://www.bilibili.com/'
            }
        }))
    }

    getTimeOfUTC8() {
        return Math.floor(DateTime.now().setZone('UTC+8').toSeconds())
    }

    getCookies() {
        const cookies = JSON.stringify(this.jar.serializeSync().cookies)
        return cookies
    }

    async getCookiesForHeader() {
        try {
            // 获取cookies对象
            const cookies = this.jar.serializeSync().cookies
            // 将每个 cookie 对象转换为 "key=value" 形式，并用 "; " 连接起来
            const cookieHeader = cookies
                .map(cookie => `${cookie.key}=${cookie.value}`)
                .join('; ')
            return cookieHeader
        } catch (e) {
            console.error("无效的 JSON 格式：", e);
            return "";
        }
    }

    getLoginInfoIsLoaded() {
        return this.loginInfoIsLoaded
    }

    async getLoginInfoFromDB() {
        // 读取数据库获取cookies
        const data = (await this.ctx.database.get('loginBili', 1))[0]
        // 判断是否登录
        if (data === undefined) {  // 没有数据则直接返回
            // 未登录，在控制台提示
            this.loginNotifier = this.ctx.notifier.create({
                type: 'warning',
                content: '您尚未登录，将无法使用插件提供的指令'
            })
            // 返回空值
            return {
                cookies: null,
                refresh_token: null
            }
        }
        // 尝试解密
        try {
            // 解密数据
            const decryptedCookies = this.decrypt(data.bili_cookies)
            // 解密refresh_token
            const decryptedRefreshToken = this.decrypt(data.bili_refresh_token)
            // 解析从数据库读到的cookies
            const cookies = JSON.parse(decryptedCookies)
            // 返回值
            return {
                cookies,
                refresh_token: decryptedRefreshToken
            }
        } catch (e) {
            // 数据库被篡改，在控制台提示
            this.loginNotifier = this.ctx.notifier.create({
                type: 'warning',
                content: '数据库被篡改，请重新登录'
            })
            // 解密或解析失败，删除数据库登录信息
            await this.ctx.database.remove('loginBili', [1])
            // 返回空值
            return {
                cookies: null,
                refresh_token: null
            }
        }
    }

    getCSRF() {
        // 获取csrf
        return this.jar.serializeSync().cookies.find(cookie => cookie.key === 'bili_jct').value
    }

    async loadCookiesFromDatabase() {
        // Get login info from db
        const { cookies, refresh_token } = await this.getLoginInfoFromDB()
        // 判断是否有值
        if (!cookies || !refresh_token) {
            // Login info is loaded
            this.loginInfoIsLoaded = true
            return
        }
        // 定义CSRF Token
        let csrf: string,
            expires: Date,
            domain: string,
            path: string,
            secure: boolean,
            httpOnly: boolean,
            sameSite: string

        cookies.forEach(cookieData => {
            // 获取key为bili_jct的值
            if (cookieData.key === 'bili_jct') {
                csrf = cookieData.value
                expires = new Date(cookieData.expires)
                domain = cookieData.domain
                path = cookieData.path
                secure = cookieData.secure
                httpOnly = cookieData.httpOnly
                sameSite = cookieData.sameSite
            }
            // 创建一个完整的 Cookie 实例
            const cookie = new Cookie({
                key: cookieData.key,
                value: cookieData.value,
                expires: new Date(cookieData.expires),
                domain: cookieData.domain,
                path: cookieData.path,
                secure: cookieData.secure,
                httpOnly: cookieData.httpOnly,
                sameSite: cookieData.sameSite
            });
            this.jar.setCookieSync(cookie, `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`, {});
        })
        // 对于某些 IP 地址，需要在 Cookie 中提供任意非空的 buvid3 字段
        const buvid3Cookie = new Cookie({
            key: 'buvid3',
            value: 'some_non_empty_value', // 设置任意非空值
            expires, // 设置过期时间
            domain, // 设置域名
            path, // 设置路径
            secure, // 设置是否为安全 cookie
            httpOnly, // 设置是否为 HttpOnly cookie
            sameSite // 设置 SameSite 属性
        });
        this.jar.setCookieSync(buvid3Cookie, `http${buvid3Cookie.secure ? 's' : ''}://${buvid3Cookie.domain}${buvid3Cookie.path}`, {});
        // Login info is loaded
        this.loginInfoIsLoaded = true
        // restart plugin check
        this.checkIfTokenNeedRefresh(refresh_token, csrf)
        // enable refresh cookies detect
        this.enableRefreshCookiesDetect()
    }

    enableRefreshCookiesDetect() {
        // 判断之前是否启动检测
        if (this.refreshCookieTimer) this.refreshCookieTimer()
        // Open scheduled tasks and check if token need refresh
        this.refreshCookieTimer = this.ctx.setInterval(async () => { // 每12小时检测一次
            // 从数据库获取登录信息
            const { cookies, refresh_token } = await this.getLoginInfoFromDB()
            // 判断是否有值
            if (!cookies || !refresh_token) return
            // 获取csrf
            const csrf = cookies.find(cookie => {
                // 判断key是否为bili_jct
                if (cookie.key === 'bili_jct') return true
            }).value
            // 检查是否需要更新
            this.checkIfTokenNeedRefresh(refresh_token, csrf)
        }, 3600000)
    }

    async checkIfTokenNeedRefresh(refreshToken: string, csrf: string, times: number = 3) {
        // 定义方法
        const notifyAndError = (info: string) => {
            // 设置控制台通知
            this.loginNotifier = this.ctx.notifier.create({
                type: 'warning',
                content: info
            })
            // 重置为未登录状态
            this.createNewClient()
            // 关闭定时器
            this.refreshCookieTimer()
            // 抛出错误
            throw new Error(info);
        }
        // 尝试获取Cookieinfo
        try {
            const { data } = await this.getCookieInfo(refreshToken)
            // 不需要刷新，直接返回
            if (!data.refresh) return
        } catch (e) {
            // 发送三次仍网络错误则直接刷新cookie
            if (times >= 1) {
                // 等待3秒再次尝试
                this.ctx.setTimeout(() => {
                    this.checkIfTokenNeedRefresh(refreshToken, csrf, times - 1)
                }, 3000)
            }
            // 如果请求失败，有可能是404，直接刷新cookie
        }
        // 定义Key
        const publicKey = await crypto.subtle.importKey(
            "jwk",
            {
                kty: "RSA",
                n: "y4HdjgJHBlbaBN04VERG4qNBIFHP6a3GozCl75AihQloSWCXC5HDNgyinEnhaQ_4-gaMud_GF50elYXLlCToR9se9Z8z433U3KjM-3Yx7ptKkmQNAMggQwAVKgq3zYAoidNEWuxpkY_mAitTSRLnsJW-NCTa0bqBFF6Wm1MxgfE",
                e: "AQAB",
            },
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["encrypt"],
        )
        // 定义获取CorrespondPath方法
        async function getCorrespondPath(timestamp) {
            const data = new TextEncoder().encode(`refresh_${timestamp}`);
            const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, data))
            return encrypted.reduce((str, c) => str + c.toString(16).padStart(2, "0"), "")
        }
        // 获取CorrespondPath
        const ts = Date.now()
        const correspondPath = await getCorrespondPath(ts)
        // 获取refresh_csrf
        const { data: refreshCsrfHtml } = await this.client.get(`https://www.bilibili.com/correspond/1/${correspondPath}`)
        // 创建一个虚拟的DOM元素
        const { document } = new JSDOM(refreshCsrfHtml).window;
        // 提取标签name为1-name的内容
        const targetElement = document.getElementById('1-name');
        const refresh_csrf = targetElement ? targetElement.textContent : null;
        // 发送刷新请求
        const { data: refreshData } = await this.client.post(
            'https://passport.bilibili.com/x/passport-login/web/cookie/refresh',
            {
                csrf,
                refresh_csrf,
                source: 'main_web',
                refresh_token: refreshToken
            },
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            })
        // 检查是否有其他问题
        switch (refreshData.code) {
            // 账号未登录
            case -101: return this.createNewClient();
            case -111: {
                await this.ctx.database.remove('loginBili', [1])
                notifyAndError('csrf 校验错误，请重新登录')
                break
            }
            case 86095: {
                await this.ctx.database.remove('loginBili', [1])
                notifyAndError('refresh_csrf 错误或 refresh_token 与 cookie 不匹配，请重新登录')
            }
        }
        // 更新 新的cookies和refresh_token
        const encryptedCookies = this.encrypt(this.getCookies())
        const encryptedRefreshToken = this.encrypt(refreshData.data.refresh_token)
        await this.ctx.database.upsert('loginBili', [{
            id: 1,
            bili_cookies: encryptedCookies,
            bili_refresh_token: encryptedRefreshToken
        }])
        // Get new csrf from cookies
        const newCsrf: string = this.jar.serializeSync().cookies.find(cookie => {
            if (cookie.key === 'bili_jct') return true
        }).value
        // Accept update
        const { data: aceeptData } = await this.client.post(
            'https://passport.bilibili.com/x/passport-login/web/confirm/refresh',
            {
                csrf: newCsrf,
                refresh_token: refreshToken
            }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            }
        })
        // 检查是否有其他问题
        switch (aceeptData.code) {
            case -111: {
                await this.ctx.database.remove('loginBili', [1])
                notifyAndError('csrf 校验失败，请重新登录')
                break
            }
            case -400: throw new Error('请求错误')
        }
        // 没有问题，cookies已更新完成
    }
}

namespace BiliAPI {
    export interface Config {
        userAgent: string
        key: string
    }

    export const Config: Schema<Config> = Schema.object({
        userAgent: Schema.string(),
        key: Schema.string()
            .pattern(/^[0-9a-f]{32}$/)
            .required()
    })
}

export default BiliAPI
