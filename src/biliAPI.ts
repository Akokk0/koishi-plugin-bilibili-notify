import { Context, Service } from "koishi"
import axios from 'axios'
import { CookieJar, Cookie } from 'tough-cookie'
import { wrapper } from 'axios-cookiejar-support'
import { JSDOM } from 'jsdom'

declare module 'koishi' {
    interface Context {
        biliAPI: BiliAPI
    }
}

const GET_DYNAMIC_LIST = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all'
const GET_USER_SPACE_DYNAMIC_LIST = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space'
const GET_COOKIES_INFO = 'https://passport.bilibili.com/x/passport-login/web/cookie/info'
const GET_USER_INFO = 'https://api.bilibili.com/x/space/wbi/acc/info'
const GET_MYSELF_INFO = 'https://api.bilibili.com/x/member/web/account'
const GET_LOGIN_QRCODE = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate'
const GET_LOGIN_STATUS = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll'
const GET_LIVE_ROOM_INFO = 'https://api.live.bilibili.com/room/v1/Room/get_info'
const GET_MASTER_INFO = 'https://api.live.bilibili.com/live_user/v1/Master/info'
const GET_TIME_NOW = 'https://api.bilibili.com/x/report/click/now'

class BiliAPI extends Service {
    static inject = ['database', 'wbi']

    jar: CookieJar
    client: any
    loginData: any

    constructor(ctx: Context) {
        super(ctx, 'biliAPI')
    }

    protected start(): void | Promise<void> {
        /* this.client = this.ctx.http.extend({
            endpoint: 'https://api.live.bilibili.com',
        }) */

        this.createNewClient()
        this.loadCookiesFromDatabase()

        this.logger.info('BiliAPI已被注册到Context中')
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

    createNewClient() {
        this.jar = new CookieJar()
        this.client = wrapper(axios.create({ jar: this.jar, headers: { 'Content-Type': 'application/json' } }))
    }

    async getCookies() {
        let cookies: string;
        this.jar.store.getAllCookies((err, c) => {
            if (err) throw err;
            cookies = JSON.stringify(c, null, 2)
        })
        return cookies
    }

    async loadCookiesFromDatabase() {
        // 读取数据库获取cookies
        const data = (await this.ctx.database.get('loginBili', 1))[0]
        // 没有数据则直接返回
        if (data === undefined) return
        // 解密数据
        const decryptedCookies = this.ctx.wbi.decrypt(data.bili_cookies)
        // 解析从数据库读到的cookies
        const cookies = JSON.parse(decryptedCookies)
        // 定义CSRF Token
        let csrf: string
        cookies.forEach(cookieData => {
            // console.log(cookieData);
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
        // 解密refresh_token
        const decryptedRefreshToken = this.ctx.wbi.decrypt(data.bili_refresh_token)
        // Check if token need refresh
        this.checkIfTokenNeedRefresh(decryptedRefreshToken, csrf)
    }

    async checkIfTokenNeedRefresh(refreshToken: string, csrf: string, times: number = 0) {
        let data: any
        try {
            const { data: cookieData } = await this.getCookieInfo(refreshToken)
            data = cookieData
        } catch (e) {
            // 发送三次仍网络错误则给管理员发送错误信息
            if (times > 3) return
            // 等待3秒再次尝试
            this.ctx.setTimeout(() => {
                this.checkIfTokenNeedRefresh(refreshToken, csrf, times + 1)
            }, 3000)
            return
        }
        // 不需要刷新，直接返回
        if (!data.refresh) return

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

        async function getCorrespondPath(timestamp) {
            const data = new TextEncoder().encode(`refresh_${timestamp}`);
            const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, data))
            return encrypted.reduce((str, c) => str + c.toString(16).padStart(2, "0"), "")
        }

        const correspondPath = await getCorrespondPath(Date.now())
        const { data: refreshCsrfHtml } = await this.client.get(`https://www.bilibili.com/correspond/1/${correspondPath}`)

        // 创建一个虚拟的DOM元素
        const { document } = new JSDOM(refreshCsrfHtml).window;
        // 提取标签name为1-name的内容
        const targetElement = document.getElementById('1-name');
        const refresh_csrf = targetElement ? targetElement.textContent : null;
        // 发送刷新请求
        const { data: refreshData } = await this.client.post('https://passport.bilibili.com/x/passport-login/web/cookie/refresh', {
            csrf,
            refresh_csrf,
            source: 'main_web',
            refresh_token: refreshToken
        })
        // 检查是否有其他问题
        switch (refreshData.code) {
            // 账号未登录
            case -101: return this.createNewClient();
            case -111: throw new Error('csrf 校验失败');
            case 86095: throw new Error('refresh_csrf 错误或 refresh_token 与 cookie 不匹配');
        }
        // 更新refresh_token
        await this.ctx.database.upsert('loginBili', [{
            id: 1,
            bili_refresh_token: refreshData.data.refresh_token
        }])
        // Get new csrf from cookies
        let newCsrf: string;
        this.jar.store.getAllCookies((err, c) => {
            if (err) throw err;
            c.forEach(cookie => {
                if (cookie.key === 'bili_jct') newCsrf = cookie.value
            });
        })
        // Accept update
        const { data: aceeptData } = await this.client.post('https://passport.bilibili.com/x/passport-login/web/confirm/refresh', {
            csrf: newCsrf,
            refresh_token: refreshToken
        })
        // 检查是否有其他问题
        switch (aceeptData.code) {
            case -111: throw new Error('csrf 校验失败')
            case -400: throw new Error('请求错误')
        }
        // 没有问题，cookies已更新完成
    }
}

/* namespace LiveAPI {
    export interface Config {
        roomId: string
    }

    export const Config: Schema<Config> = Schema.object({
        roomId: Schema.string().required()
    })
} */

export default BiliAPI