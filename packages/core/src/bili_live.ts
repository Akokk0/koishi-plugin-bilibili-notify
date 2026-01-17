// biome-ignore assist/source/organizeImports: <import>
import { type Awaitable, type Context, Schema, Service } from "koishi";
import {
	type MessageListener,
	startListen,
	type MsgHandler,
} from "blive-message-listener";
import type { MySelfInfoData } from "./type";

declare module "koishi" {
	interface Context {
		"bilibili-notify-live": BLive;
	}
}

class BLive extends Service {
	// 必要服务
	static inject = ["bilibili-notify-api"];
	// 定义类属性
	private listenerRecord: Record<string, MessageListener> = {};

	constructor(ctx: Context, config: BLive.Config) {
		// Extends super
		super(ctx, "bilibili-notify-live");
		// logger
		this.logger.level = config.logLevel;
	}

	// 注册插件dispose逻辑
	protected stop(): Awaitable<void> {
		// 清除所有监听器
		this.clearListeners();
	}

	public async startLiveRoomListener(roomId: string, handler: MsgHandler) {
		// 判断是否已存在连接
		if (this.listenerRecord[roomId]) {
			this.logger.warn(`直播间 [${roomId}] 连接已存在，跳过创建`);
			return;
		}
		// 获取cookieStr
		const cookiesStr =
			await this.ctx["bilibili-notify-api"].getCookiesForHeader();
		// 已登录，请求个人信息
		const mySelfInfo = (await this.ctx[
			"bilibili-notify-api"
		].getMyselfInfo()) as MySelfInfoData;
		// 判断是否获取成功
		if (mySelfInfo.code !== 0) {
			this.logger.warn(`获取个人信息失败，无法创建直播间 [${roomId}] 连接`);
			return;
		}
		// 创建实例并保存到Record中
		this.listenerRecord[roomId] = startListen(
			Number.parseInt(roomId, 10),
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
		this.logger.info(`直播间 [${roomId}] 连接已建立`);
	}

	public closeListener(roomId: string) {
		// 判断直播间监听器是否关闭
		if (!this.listenerRecord || !this.listenerRecord[roomId]?.closed) {
			this.logger.debug(`直播间 [${roomId}] 连接无需关闭`);
		}
		// 关闭直播间监听器
		this.listenerRecord[roomId].close();
		// 判断是否关闭成功
		if (this.listenerRecord[roomId].closed) {
			// 删除直播间监听器
			delete this.listenerRecord[roomId];
			this.logger.info(`直播间 [${roomId}] 连接已关闭`);
			// 直接返回
			return;
		}
		// 未关闭成功
		this.logger.error(`直播间 [${roomId}] 连接关闭失败`);
	}

	public clearListeners() {
		// 关闭所有监听器
		for (const key of Object.keys(this.listenerRecord)) {
			// 关闭监听器
			this.closeListener(key);
			// 清空记录
			delete this.listenerRecord[key];
		}
	}
}

namespace BLive {
	export interface Config {
		logLevel: number;
	}

	export const Config: Schema<Config> = Schema.object({
		logLevel: Schema.number().required(),
	});
}

export default BLive;
