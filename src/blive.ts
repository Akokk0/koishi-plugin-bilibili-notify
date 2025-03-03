import { Awaitable, Context, Schema, Service } from "koishi";
import { MessageListener, startListen, type MsgHandler } from 'blive-message-listener'

declare module 'koishi' {
    interface Context {
        bl: BLive
    }
}

class BLive extends Service {
    // 必要服务
    static inject = ['ba']
    // 定义类属性
    private listenerRecord: Record<string, MessageListener> = {}
    private timerRecord: Record<string, () => void> = {}

    constructor(ctx: Context) {
        super(ctx, 'bl')
    }

    // 注册插件dispose逻辑
    protected stop(): Awaitable<void> {
        // 清除所有监听器
        for (const key of Object.keys(this.listenerRecord)) {
            this.closeListener(key)
        }
    }

    async startLiveRoomListener(
        roomId: string,
        handler: MsgHandler,
        pushOnceEveryTens: () => void
    ) {
        // 获取cookieStr
        const cookiesStr = await this.ctx.ba.getCookiesForHeader()
        // 获取自身信息
        const mySelfInfo = await this.ctx.ba.getMyselfInfo()
        // 创建实例并保存到Record中
        this.listenerRecord[roomId] = startListen(parseInt(roomId), handler, {
            ws: {
                headers: {
                    Cookie: cookiesStr
                },
                uid: mySelfInfo.data.mid
            }
        })
        // 10s推送一次弹幕消息到群组并将dispose函数保存到Record中
        this.timerRecord[roomId] = this.ctx.setInterval(pushOnceEveryTens, this.config.danmakuPushTime * 1000 * 60)
    }

    closeListener(roomId: string) {
        // 判断是否关闭
        if (!this.listenerRecord || !this.listenerRecord[roomId] || !this.listenerRecord[roomId].closed) {
            // 输出logger
            this.logger.info('直播间监听无需关闭')
            // 直接返回
            return
        }
        // 关闭监听器
        this.listenerRecord[roomId].close()
        // 判断是否关闭成功
        if (this.listenerRecord[roomId].closed) {
            // 将值置为空
            delete this.listenerRecord[roomId]
            // 输出logger
            this.logger.info('直播间监听已关闭')
            // 直接返回 
            return
        }
        // 未关闭成功
        this.logger.warn('直播间监听未成功关闭')
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace BLive {
    export interface Config {
        danmakuPushTime: number
    }

    export const Config: Schema<Config> = Schema.object({
        danmakuPushTime: Schema.number().required()
    })
}

export default BLive
