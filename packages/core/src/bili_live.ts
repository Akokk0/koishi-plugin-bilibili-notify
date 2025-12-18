// biome-ignore assist/source/organizeImports: <import>
import { type Awaitable, type Context, Service } from "koishi";
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

	constructor(ctx: Context) {
		// Extends super
		super(ctx, "bilibili-notify-live");
	}

	// 注册插件dispose逻辑
	protected stop(): Awaitable<void> {
		// 清除所有监听器
		this.clearListeners();
	}

	public async startLiveRoomListener(roomId: string, handler: MsgHandler) {
		// 判断是否已存在连接
		if (this.listenerRecord[roomId]) {
			this.logger.warn(
				`主人～女仆发现 [${roomId}] 直播间连接已经存在啦，不能重复创建哦 (>ω<)♡`,
			);
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
			this.logger.warn(
				`主人～女仆获取个人信息失败啦～无法创建 [${roomId}] 直播间连接呢～请主人帮女仆看看呀 (>ω<)♡`,
			);
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
		this.logger.info(
			`主人～女仆成功建立了 [${roomId}] 直播间连接啦～乖乖完成任务呢 (>ω<)♡`,
		);
	}

	public closeListener(roomId: string) {
		// 判断直播间监听器是否关闭
		if (!this.listenerRecord || !this.listenerRecord[roomId]?.closed) {
			// 输出logger
			this.logger.info(
				`主人～女仆发现 ${roomId} 直播间连接不需要关闭哦 (>ω<)♡`,
			);
		}
		// 关闭直播间监听器
		this.listenerRecord[roomId].close();
		// 判断是否关闭成功
		if (this.listenerRecord[roomId].closed) {
			// 删除直播间监听器
			delete this.listenerRecord[roomId];
			// 输出logger
			this.logger.info(`主人～女仆已经关闭了 ${roomId} 直播间连接啦 (>ω<)♡`);
			// 直接返回
			return;
		}
		// 未关闭成功
		this.logger.warn(
			`主人呜呜 (；>_<) 女仆尝试关闭 ${roomId} 直播间连接失败啦～请主人帮女仆看看呀 (>ω<)♡`,
		);
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

export default BLive;
