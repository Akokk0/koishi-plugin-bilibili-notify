import { type Awaitable, type Context, Service } from "koishi";
import {
	type MessageListener,
	startListen,
	type MsgHandler,
} from "@akokko/blive-message-listener";

declare module "koishi" {
	interface Context {
		bl: BLive;
	}
}

class BLive extends Service {
	// 必要服务
	static inject = ["ba"];
	// 定义类属性
	private listenerRecord: Record<string, MessageListener> = {};

	constructor(ctx: Context) {
		// Extends super
		super(ctx, "bl");
	}

	// 注册插件dispose逻辑
	protected stop(): Awaitable<void> {
		// 清除所有监听器
		for (const key of Object.keys(this.listenerRecord)) {
			this.closeListener(key);
		}
	}

	async startLiveRoomListener(roomId: string, handler: MsgHandler) {
		// 获取cookieStr
		const cookiesStr = await this.ctx.ba.getCookiesForHeader();
		// 获取自身信息
		const mySelfInfo = await this.ctx.ba.getMyselfInfo();
		// 创建实例并保存到Record中
		this.listenerRecord[roomId] = startListen(
			Number.parseInt(roomId),
			handler,
			{
				ws: {
					headers: {
						Cookie: cookiesStr,
					},
					uid: mySelfInfo.data.mid,
				},
			},
		);
	}

	closeListener(roomId: string) {
		// 判断直播间监听器是否关闭
		if (
			!this.listenerRecord ||
			!this.listenerRecord[roomId]?.closed
		) {
			// 输出logger
			this.logger.info(`${roomId}直播间弹幕监听器无需关闭`);
		}
		// 关闭直播间监听器
		this.listenerRecord[roomId].close();
		// 判断是否关闭成功
		if (this.listenerRecord[roomId].closed) {
			// 删除直播间监听器
			delete this.listenerRecord[roomId];
			// 输出logger
			this.logger.info(`${roomId}直播间弹幕监听已关闭`);
			// 直接返回
			return;
		}
		// 未关闭成功
		this.logger.warn(`${roomId}直播间弹幕监听未成功关闭`);
	}
}

export default BLive;
