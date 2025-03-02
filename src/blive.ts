import { Context, Service } from "koishi";
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
    private listener: MessageListener
    private danmakuArr: Array<string>

    constructor(ctx: Context) {
        super(ctx, 'bl')
        // 注册服务停用逻辑
        ctx.on('dispose', () => {
            this.closeListener()
        })
    }

    async startLiveRoomListener(roomId: number) {
        // 获取cookieStr
        const cookiesStr = await this.ctx.ba.getCookiesForHeader()
        // 构建消息处理函数
        const handler: MsgHandler = {
            onOpen: () => {
                this.logger.info('服务器连接成功')
            },
            onClose: () => {
                this.logger.info('服务器连接已断开')
            },
            onIncomeDanmu: ({body}) => {
                // 处理消息，只需要UP主名字和消息内容
                const content = `${body.user.uname}：${body.content}`
                const bot = this.ctx.bots.find(bot => bot.platform === 'qqguild')
                bot.sendMessage('635762054', content)
            },
            onIncomeSuperChat: (msg) => {
                console.log(msg.id, msg.body)
            }
        }
        // 获取自身信息
        const mySelfInfo = await this.ctx.ba.getMyselfInfo()
        // 创建实例
        this.listener = startListen(roomId, handler, {
            ws: {
                headers: {
                    Cookie: cookiesStr
                },
                uid: mySelfInfo.data.mid
            }
        })
    }

    closeListener() {
        // 判断是否关闭
        if (!this.listener || !this.listener.closed) {
            // 输出logger
            this.logger.info('直播间监听无需关闭')
            // 直接返回
            return
        }
        // 关闭监听器
        this.listener.close()
        // 判断是否关闭成功
        if (this.listener.closed) {
            // 将值置为空
            this.listener = null
            // 输出logger
            this.logger.info('直播间监听已关闭')
            // 直接返回 
            return
        }
        // 未关闭成功
        this.logger.warn('直播间监听未成功关闭')
    }
}

export default BLive
