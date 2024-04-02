import { Context, Service } from "koishi"
import axios from 'axios'
import { CookieJar, Cookie } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { JSDOM } from 'jsdom'
import { Notifier } from "@koishijs/plugin-notifier"
import { DateTime } from "luxon"

declare module 'koishi' {
    interface Context {
        biliAPI: BiliAPI
    }
}

// 在getUserInfo中检测到番剧出差的UID时，要传回的数据：
const bangumiTripData = { "code": 0, "data": { "live_room": { "roomid": 931774 } } }

// const GET_DYNAMIC_LIST = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all'
const GET_USER_SPACE_DYNAMIC_LIST = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space'
const GET_COOKIES_INFO = 'https://passport.bilibili.com/x/passport-login/web/cookie/info'
const GET_USER_INFO = 'https://api.bilibili.com/x/space/wbi/acc/info'
const GET_MYSELF_INFO = 'https://api.bilibili.com/x/member/web/account'
const GET_LOGIN_QRCODE = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate'
const GET_LOGIN_STATUS = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll'
const GET_LIVE_ROOM_INFO = 'https://api.live.bilibili.com/room/v1/Room/get_info'
const GET_MASTER_INFO = 'https://api.live.bilibili.com/live_user/v1/Master/info'
const GET_TIME_NOW = 'https://api.bilibili.com/x/report/click/now'
const GET_SERVER_UTC_TIME = 'https://interface.bilibili.com/serverdate.js'

class BiliAPI extends Service {
    static inject = ['database', 'wbi', 'notifier']

    jar: CookieJar
    client: any
    loginData: any
    loginNotifier: Notifier
    refreshCookieTimer: Function
    loginInfoIsLoaded: boolean = false

    constructor(ctx: Context) {
        super(ctx, 'biliAPI')
    }

    protected start(): void | Promise<void> {
        // 创建新的http客户端(axios)
        this.createNewClient()
        // 从数据库加载cookies
        this.loadCookiesFromDatabase()
        // logger
        // this.logger.info('工作中')
    }

    protected stop(): void | Promise<void> {
        // this.logger.info('已停止工作')
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

    async getUserSpaceDynamic(mid: string) {
        try {
            const { data } = await this.client.get(`${GET_USER_SPACE_DYNAMIC_LIST}?host_mid=${mid}`)
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
            const wbi = await this.ctx.wbi.getWbi({ mid })
            const { data } = await this.client.get(`${GET_USER_INFO}?${wbi}`)
            return data
        } catch (e) {
            throw new Error('网络异常，本次请求失败！')
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

    disposeNotifier() { this.loginNotifier && this.loginNotifier.dispose() }

    createNewClient() {
        this.jar = new CookieJar()
        this.client = wrapper(axios.create({
            jar: this.jar,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://www.bilibili.com',
                'Referer': 'https://www.bilibili.com/'
            }
        }))
    }

    getTimeOfUTC8() {
        return Math.floor(DateTime.now().setZone('UTC+8').toSeconds())
    }

    getCookies() {
        let cookies: string
        cookies = JSON.stringify(this.jar.serializeSync().cookies)
        return cookies
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
        // 定义解密信息
        let decryptedCookies: string
        let decryptedRefreshToken: string
        try {
            // 解密数据
            decryptedCookies = this.ctx.wbi.decrypt(data.bili_cookies)
            // 解密refresh_token
            decryptedRefreshToken = this.ctx.wbi.decrypt(data.bili_refresh_token)
        } catch (e) {
            // 解密失败，删除数据库登录信息
            await this.ctx.database.remove('loginBili', [1])
            // 直接返回
            return
        }
        // 解析从数据库读到的cookies
        const cookies = JSON.parse(decryptedCookies)
        // 返回值
        return {
            cookies,
            refresh_token: decryptedRefreshToken
        }
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
        let csrf: string
        cookies.forEach(cookieData => {
            // 获取key为bili_jct的值
            if (cookieData.key === 'bili_jct') csrf = cookieData.value
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
        // Login info is loaded
        this.loginInfoIsLoaded = true
        // restart plugin check
        this.checkIfTokenNeedRefresh(refresh_token, csrf)
        // enable refresh cookies detect
        this.enableRefreshCookiesDetect()
    }

    enableRefreshCookiesDetect() {
        // 判断之前是否启动检测
        this.refreshCookieTimer && this.refreshCookieTimer()
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
            }
            case 86095: {
                await this.ctx.database.remove('loginBili', [1])
                notifyAndError('refresh_csrf 错误或 refresh_token 与 cookie 不匹配，请重新登录')
            }
        }
        // 更新 新的cookies和refresh_token
        const encryptedCookies = this.ctx.wbi.encrypt(this.getCookies())
        const encryptedRefreshToken = this.ctx.wbi.encrypt(refreshData.data.refresh_token)
        await this.ctx.database.upsert('loginBili', [{
            id: 1,
            bili_cookies: encryptedCookies,
            bili_refresh_token: encryptedRefreshToken
        }])
        // Get new csrf from cookies
        let newCsrf: string = this.jar.serializeSync().cookies.find(cookie => {
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
            }
            case -400: throw new Error('请求错误')
        }
        // 没有问题，cookies已更新完成
    }
}

export default BiliAPI