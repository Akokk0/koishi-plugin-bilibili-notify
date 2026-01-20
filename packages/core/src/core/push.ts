import {
	type Awaitable,
	type Bot,
	type Context,
	h,
	Schema,
	Service,
	Universal,
} from "koishi";
import { type PushArrMap, PushType, PushTypeMsg } from "../type";
import { withRetry } from "../utils";

class BilibiliNotifyPush extends Service {
	// 机器人实例
	privateBot: Bot<Context>;
	// 重启次数
	rebootCount: number = 0;
	// 推送对象信息是否初始化完毕
	pushArrMapInitializing: boolean = false;
	// PushArrMap
	pushArrMap: PushArrMap;
	// 构造函数
	constructor(ctx: Context, config: BilibiliNotifyPush.Config) {
		super(ctx, "bilibili-notify-push");
		// 配置
		this.config = config;
		// 设置日志级别
		this.logger.level = config.logLevel;
	}
	protected start(): Awaitable<void> {
		// 拿到私人机器人实例
		this.privateBot = this.ctx.bots.find(
			(bot) => bot.platform === this.config.master.platform,
		);
		if (!this.privateBot) {
			this.ctx.notifier.create({
				content: "未配置管理员账号，无法推送插件运行状态，请尽快配置",
			});
		}
	}
	// biome-ignore lint/suspicious/noExplicitAny: <any>
	getBot(pf: string, selfId?: string): Bot<Context, any> {
		// 判断是否存在selfId
		if (!selfId || selfId === "") {
			// 不存在则默认第一个bot
			return this.ctx.bots.find((bot) => bot.platform === pf);
		}
		// 存在则返回对应bot
		return this.ctx.bots.find(
			(bot) => bot.platform === pf && bot.selfId === selfId,
		);
	}

	async sendPrivateMsg(content: string) {
		// 判断是否开启私聊推送功能
		if (this.config.master.enable) {
			// 判断私人机器人是否具备推送条件
			if (this.privateBot?.status !== Universal.Status.ONLINE) {
				// 不具备推送条件 logger
				this.logger.warn(
					`${this.privateBot.platform} 机器人未初始化，暂时无法推送`,
				);
				// 返回
				return;
			}
			// 判断是否填写群组号
			if (this.config.master.masterAccountGuildId) {
				// 向机器人管理员发送消息
				await this.privateBot.sendPrivateMessage(
					this.config.master.masterAccount,
					content,
					this.config.master.masterAccountGuildId,
				);
			} else {
				// 向机器人管理员发送消息
				await this.privateBot.sendPrivateMessage(
					this.config.master.masterAccount,
					content,
				);
			}
		}
	}

	async sendPrivateMsgAndRebootService() {
		// 判断重启次数是否超过三次
		if (this.rebootCount >= 3) {
			// logger
			this.logger.error(
				"已重启插件3次，请检查机器人状态后使用 `bn start` 启动插件",
			);
			// 重启失败，发送消息
			await this.sendPrivateMsg(
				"已重启插件3次，请检查机器人状态后使用 `bn start` 启动插件",
			);
			// 关闭插件
			await this.ctx["bilibili-notify"].disposePlugin();
			// 结束
			return;
		}
		// 重启次数+1
		this.rebootCount++;
		// logger
		this.logger.info("插件出现未知错误，正在重启插件");
		// 重启插件
		const flag = await this.ctx["bilibili-notify"].restartPlugin();
		// 判断是否重启成功
		if (flag) {
			this.logger.info("插件重启成功");
		} else {
			// logger
			this.logger.error(
				"插件重启失败，请检查机器人状态后使用 `bn start` 启动插件",
			);
			// 重启失败，发送消息
			await this.sendPrivateMsg(
				"插件重启失败，请检查机器人状态后使用 `bn start` 启动插件",
			);
			// 关闭插件
			await this.ctx["bilibili-notify"].disposePlugin();
		}
	}

	async sendPrivateMsgAndStopService() {
		// 发送消息
		await this.sendPrivateMsg(
			"插件发生未知错误，请检查机器人状态后使用 `bn start` 启动插件",
		);
		// logger
		this.logger.error(
			"插件发生未知错误，请检查机器人状态后使用 `bn start` 启动插件",
		);
		// 关闭插件
		await this.ctx["bilibili-notify"].disposePlugin();
		// 结束
		return;
	}

	async sendMessageWithRetry(
		bot: Bot<Context>,
		channelId: string,
		// biome-ignore lint/suspicious/noExplicitAny: <any>
		content: any,
	) {
		withRetry(async () => await bot.sendMessage(channelId, content), 1).catch(
			async (e: Error) => {
				if (e.message === "this._request is not a function") {
					// 2S之后重新发送消息
					this.ctx.setTimeout(async () => {
						await this.sendMessageWithRetry(bot, channelId, content);
					}, 2000);
					// 返回
					return;
				}
				// 打印错误信息
				this.logger.error(
					`发送消息失败，群组ID: ${channelId}，错误：${e.message}`,
				);
				await this.sendPrivateMsg(`发送消息失败，群组ID: ${channelId}`);
			},
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: <message>
	async pushMessage(targets: Array<string>, content: any) {
		// 初始化目标
		const t: Record<string, Array<string>> = {};
		// 遍历获取target
		for (const target of targets) {
			// 分解平台和群组
			const [platform, channleId] = target.split(":");
			/* 
                    将平台群组添加到Record中
                    如果不存则初始化数组
                */
			if (!t[platform]) t[platform] = [channleId];
			// 存在则直接push
			else t[platform].push(channleId);
		}
		// 获取平台
		for (const platform of Object.keys(t)) {
			// 定义机器人数组
			const bots: Array<Bot> = [];
			// 获取所有同平台机器人
			for (const bot of this.ctx.bots) {
				// 判断是否为该平台机器人
				if (bot.platform === platform) bots.push(bot);
			}
			// 定义成功发送消息条数
			let num = 0;
			// 定义bot发送消息函数
			const sendMessageByBot = async (
				channelId: string,
				botIndex = 0,
				retry = 3000,
			) => {
				// 判断机器人是否存在
				if (!bots[botIndex]) {
					this.logger.warn(`${platform} 没有配置对应机器人，无法推送`);
					return;
				}
				// 判断机器人状态
				if (bots[botIndex].status !== Universal.Status.ONLINE) {
					// 判断是否超过5次重试
					if (retry >= 3000 * 2 ** 5) {
						// logger
						this.logger.error(
							`${platform} 机器人未初始化，已重试5次，放弃推送`,
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							`${platform} 机器人未初始化，已重试5次，放弃推送`,
						);
						// 返回
						return;
					}
					// 有机器人未准备好，直接返回
					this.logger.warn(
						`${platform} 机器人未初始化，${retry / 1000} 秒后重试`,
					);
					// 等待
					await this.ctx.sleep(retry);
					// 重试(指数退避)
					await sendMessageByBot(channelId, botIndex, retry * 2);
					// 返回
					return;
				}
				// 发送消息
				try {
					await bots[botIndex].sendMessage(channelId, content);
					// 消息成功发送+1
					num++;
					// 延迟发送
					await this.ctx.sleep(500);
				} catch (e) {
					// logger
					this.logger.error(`发送消息失败：${e}`);
					// 判断是否还有其他机器人
					if (bots.length > 1) await sendMessageByBot(channelId, botIndex++);
				}
			};
			// 发送消息
			for (const channelId of t[platform]) {
				await sendMessageByBot(channelId);
			}
			// logger
			this.logger.info(`成功推送 ${num} 条消息`);
		}
	}

	async broadcastToTargets(
		uid: string,
		// biome-ignore lint/suspicious/noExplicitAny: <any>
		content: any,
		type: PushType,
	) {
		// 判断pushArrMap是否初始化完毕
		if (!this.pushArrMapInitializing) {
			this.logger.warn(
				`推送对象信息尚未初始化完毕，等待5秒钟后重试推送，推送对象: ${uid}, 推送类型: ${PushTypeMsg[type]}`,
			);
			// 等待5秒钟
			await this.ctx.sleep(5000);
			// 递归调用
			return this.broadcastToTargets(uid, content, type);
		}
		// 获取推送记录
		const record = this.pushArrMap.get(uid);
		// 判断记录是否存在
		if (!record) return;
		// 先判断是否有任何推送目标
		const hasTargets =
			(type === PushType.StartBroadcasting &&
				record.liveAtAllArr?.length > 0) ||
			(type === PushType.Dynamic &&
				(record.dynamicArr?.length > 0 ||
					record.dynamicAtAllArr?.length > 0)) ||
			((type === PushType.Live || type === PushType.StartBroadcasting) &&
				record.liveArr?.length > 0) ||
			(type === PushType.LiveGuardBuy && record.liveGuardBuyArr?.length > 0) ||
			(type === PushType.Superchat && record.superchatArr?.length > 0) ||
			(type === PushType.WordCloudAndLiveSummary &&
				(record.wordcloudArr?.length > 0 || record.liveSummaryArr?.length > 0));

		if (!hasTargets) return; // 没有需要推送的对象，直接结束

		// 有推送目标才打印一次全局信息
		this.logger.info(`推送对象: ${uid}, 推送类型: ${PushTypeMsg[type]}`);

		// 推送 @全体（开播）
		if (
			type === PushType.StartBroadcasting &&
			record.liveAtAllArr?.length > 0
		) {
			this.logger.debug(`推送给 @全体，对象列表：${record.liveAtAllArr}`);
			const atAllArr = structuredClone(record.liveAtAllArr);
			await withRetry(() => this.pushMessage(atAllArr, h.at("all")), 1);
		}

		// 推送动态
		if (type === PushType.Dynamic && record.dynamicArr?.length > 0) {
			if (record.dynamicAtAllArr?.length > 0) {
				this.logger.debug(
					`推送动态给 @全体，对象列表：${record.dynamicAtAllArr}`,
				);
				const dynamicAtAllArr = structuredClone(record.dynamicAtAllArr);
				await withRetry(
					() => this.pushMessage(dynamicAtAllArr, h.at("all")),
					1,
				);
			}
			this.logger.debug(`推送动态，对象列表：${record.dynamicArr}`);
			const dynamicArr = structuredClone(record.dynamicArr);
			await withRetry(
				() => this.pushMessage(dynamicArr, h("message", content)),
				1,
			);
		}

		// 推送直播
		if (
			(type === PushType.Live || type === PushType.StartBroadcasting) &&
			record.liveArr?.length > 0
		) {
			this.logger.debug(`推送直播，对象列表：${record.liveArr}`);
			const liveArr = structuredClone(record.liveArr);
			await withRetry(
				() => this.pushMessage(liveArr, h("message", content)),
				1,
			);
		}

		// 推送直播守护购买
		if (type === PushType.LiveGuardBuy && record.liveGuardBuyArr?.length > 0) {
			this.logger.debug(
				`推送直播守护购买消息，对象列表：${record.liveGuardBuyArr}`,
			);
			const liveGuardBuyArr = structuredClone(record.liveGuardBuyArr);
			await withRetry(
				() => this.pushMessage(liveGuardBuyArr, h("message", content)),
				1,
			);
		}

		// 推送SC
		if (type === PushType.Superchat && record.superchatArr?.length > 0) {
			this.logger.debug(`推送 SC 消息，对象列表：${record.superchatArr}`);
			const superchatArr = structuredClone(record.superchatArr);
			await withRetry(
				() => this.pushMessage(superchatArr, h("message", content)),
				1,
			);
		}

		// 推送词云和直播总结
		if (type === PushType.WordCloudAndLiveSummary) {
			const wordcloudArr = structuredClone(record.wordcloudArr);
			const liveSummaryArr = structuredClone(record.liveSummaryArr);

			const wordcloudAndLiveSummaryArr = wordcloudArr.filter((item) =>
				liveSummaryArr.includes(item),
			);
			const wordcloudOnlyArr = wordcloudArr.filter(
				(item) => !liveSummaryArr.includes(item),
			);
			const liveSummaryOnlyArr = liveSummaryArr.filter(
				(item) => !wordcloudArr.includes(item),
			);

			if (wordcloudAndLiveSummaryArr.length > 0) {
				this.logger.debug(
					`推送词云和直播总结，对象列表：${wordcloudAndLiveSummaryArr}`,
				);

				const msgs = content.filter(Boolean);
				if (msgs.length > 0) {
					await withRetry(
						() =>
							this.pushMessage(wordcloudAndLiveSummaryArr, h("message", msgs)),
						1,
					);
				}
			}

			if (content[0] && wordcloudOnlyArr.length > 0) {
				this.logger.debug(`推送词云，对象列表：${wordcloudOnlyArr}`);
				await withRetry(
					() => this.pushMessage(wordcloudOnlyArr, h("message", content[0])),
					1,
				);
			}

			if (content[1] && liveSummaryOnlyArr.length > 0) {
				this.logger.debug(`推送直播总结，对象列表：${liveSummaryOnlyArr}`);
				await withRetry(
					() => this.pushMessage(liveSummaryOnlyArr, h("message", content[1])),
					1,
				);
			}
		}
	}
}

namespace BilibiliNotifyPush {
	export interface Config {
		logLevel: number;
		master: {
			enable: boolean;
			platform: string;
			masterAccount: string;
			masterAccountGuildId: string;
		};
	}

	export const Config: Schema<Config> = Schema.object({
		logLevel: Schema.number().required(),
		master: Schema.object({
			enable: Schema.boolean(),
			platform: Schema.string(),
			masterAccount: Schema.string(),
			masterAccountGuildId: Schema.string(),
		}),
	});
}

export default BilibiliNotifyPush;
