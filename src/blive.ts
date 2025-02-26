import { Context, Logger } from "koishi";

class BLive {
    // 必须服务
    static inject = ['']
    // 定义类属性
    ctx: Context
    logger: Logger
    // 构造函数
    constructor(ctx: Context) {
        // 将Context赋值给类属性
        this.ctx = ctx
        // 将logger赋值给类属性
        this.logger = ctx.logger('bl')
    }
    // 定义方法
    connectToLiveBroadcastRoom(roomId: string) {
        console.log(roomId);
    }
}

export default BLive