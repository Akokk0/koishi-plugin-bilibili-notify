import { Context, Logger } from "koishi";
import { startListen, type MsgHandler } from 'blive-message-listener'

class BLive {
    // 必要服务
    static inject = ['ba']
    // 定义类属性
    ctx: Context
    logger: Logger

    constructor(ctx: Context) {
        // 将ctx赋值给类属性
        this.ctx = ctx
        // 创建logger
        this.logger = ctx.logger('bl')
        // TEST
        ctx.setTimeout(() => {
            this.startLiveRoomListener(732)
        }, 1000)
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
            onIncomeDanmu: (msg) => {
                console.log(msg.id, msg.body)
            },
            onIncomeSuperChat: (msg) => {
                console.log(msg.id, msg.body)
            }
        }
        // 获取自身信息
        const mySelfInfo = await this.ctx.ba.getMyselfInfo()
        // 创建实例
        startListen(roomId, handler, {
            ws: {
                headers: {
                    Cookie: cookiesStr
                },
                uid: mySelfInfo.data.mid
            }
        })
    }
}

export default BLive
