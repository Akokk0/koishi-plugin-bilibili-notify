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
    // 配置
    private blConfig: BLive.Config
    // 定义类属性
    private listenerRecord: Record<string, MessageListener> = {}
    private timerRecord: Record<string, () => void> = {}

    constructor(ctx: Context, config: BLive.Config) {
        // Extends super
        super(ctx, 'bl')
        // 将config赋值给类属性
        this.blConfig = config
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
        danmakuPushTime: () => void
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
        // 默认30s推送一次弹幕消息到群组并将dispose函数保存到Record中
        this.timerRecord[roomId] = this.ctx.setInterval(danmakuPushTime, this.blConfig.danmakuPushTime * 1000 * 60)
        // logger
        this.logger.info(`${roomId}直播间弹幕监听已开启`)
    }

    closeListener(roomId: string) {
        // 判断直播间监听器是否关闭
        if (!this.listenerRecord || !this.listenerRecord[roomId] || !this.listenerRecord[roomId].closed) {
            // 输出logger
            this.logger.info(`${roomId}直播间弹幕监听器无需关闭`)
        }
        // 判断消息发送定时器是否关闭
        if (!this.timerRecord || !this.timerRecord[roomId]) {
            // 输出logger
            this.logger.info(`${roomId}直播间消息发送定时器无需关闭`)
        }
        // 关闭直播间监听器
        this.listenerRecord[roomId].close()
        // 关闭消息发送定时器
        this.timerRecord[roomId]()
        // 判断是否关闭成功
        if (this.listenerRecord[roomId].closed) {
            // 删除直播间监听器
            delete this.listenerRecord[roomId]
            // 删除消息发送定时器
            delete this.timerRecord[roomId]
            // 输出logger
            this.logger.info(`${roomId}直播间弹幕监听已关闭`)
            // 直接返回 
            return
        }
        // 未关闭成功
        this.logger.warn(`${roomId}直播间弹幕监听未成功关闭`)
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
