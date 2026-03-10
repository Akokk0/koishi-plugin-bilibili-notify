import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict";
import {
	GuardLevel,
	type MessageListener,
	type MsgHandler,
	startListen,
} from "blive-message-listener";
import { type Awaitable, type Context, h, Logger, Schema, Service } from "koishi";
import { DateTime } from "luxon";
import definedStopWords from "../stop_words";
import {
	type LiveData,
	type LivePushTimerManager,
	type LiveRoomInfo,
	LiveType,
	type MasterInfo,
	type MasterInfoR,
	type MySelfInfoData,
	PushType,
	type Subscription,
	type UserInfoInLiveData,
} from "../type";
import { replaceButKeep, withRetry } from "../utils";

declare module "koishi" {
	interface Context {
		"bilibili-notify-live": BilibiliNotifyLive;
	}
}

const BILIBILI_NOTIFY_LIVE = "bilibili-notify-live";

class BilibiliNotifyLive extends Service<BilibiliNotifyLive.Config> {
	// 依赖
	static inject = [
		"bilibili-notify-api",
		"bilibili-notify-generate-img",
		"bilibili-notify-push",
	];
	// logger
	private liveLogger: Logger;
	// 创建segmentit
	private _jieba = Jieba.withDict(dict);
	// 停用词
	private stopwords: Set<string>;
	// 定义类属性
	private listenerRecord: Record<string, MessageListener> = {};
	private livePushTimerManager: LivePushTimerManager;
	private disposed = false;
	private readonly instanceId = `${Date.now()}-${Math.random()
		.toString(36)
		.slice(2, 8)}`;

	constructor(ctx: Context, config: BilibiliNotifyLive.Config) {
		// super
		super(ctx, BILIBILI_NOTIFY_LIVE);
		// 设置config
		this.config = config;
		// logger
		this.liveLogger = new Logger(BILIBILI_NOTIFY_LIVE);
		this.liveLogger.level = this.config.logLevel;
		// 合并停用词
		this.mergeStopWords(config.wordcloudStopWords);
	}

	protected start(): Awaitable<void> {
		this.disposed = false;
		this.livePushTimerManager = new Map();
		this.listenerRecord = {};
		this.logSideEffectState("start");
	}

	// 注册插件dispose逻辑
	protected stop(): Awaitable<void> {
		this.logSideEffectState("stop:before-clear");
		this.disposed = true;
		// 清除定时器
		this.clearPushTimers();
		// 清除所有监听器
		this.clearListeners();
		this.logSideEffectState("stop:after-clear");
	}

	private isDisposed() {
		return this.disposed;
	}

	private getListenerCount() {
		return Object.keys(this.listenerRecord).length;
	}

	private logSideEffectState(stage: string) {
		this.liveLogger.debug(
			`[live:${this.instanceId}] ${stage} listeners=${this.getListenerCount()} timers=${this.livePushTimerManager?.size ?? 0} disposed=${this.disposed}`,
		);
	}

	private mergeStopWords(stopWordsStr: string) {
		// 如果没有停用词，则直接返回
		if (!stopWordsStr || stopWordsStr.trim() === "") {
			this.stopwords = new Set(definedStopWords);
			return;
		}
		// 将停用词字符串转换为数组
		const additionalStopWords = stopWordsStr
			.split(",")
			.map((word) => word.trim())
			.filter((word) => word !== "");
		// 将停用词转换为Set
		this.stopwords = new Set([...definedStopWords, ...additionalStopWords]);
	}

	private async startLiveRoomListener(roomId: string, handler: MsgHandler) {
		if (this.isDisposed()) return;
		// 判断是否已存在连接
		if (this.listenerRecord[roomId]) {
			this.liveLogger.warn(`直播间 [${roomId}] 连接已存在，跳过创建`);
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
			this.liveLogger.warn(`获取个人信息失败，无法创建直播间 [${roomId}] 连接`);
			return;
		}
		if (this.isDisposed()) return;
		// 创建实例并保存到Record中
		const listener = startListen(Number.parseInt(roomId, 10), handler, {
			ws: {
				headers: {
					Cookie: cookiesStr,
				},
				uid: mySelfInfo.data.mid,
			},
		});
		if (this.isDisposed()) {
			listener.close();
			return;
		}
		this.listenerRecord[roomId] = listener;
		this.liveLogger.info(`直播间 [${roomId}] 连接已建立`);
		this.logSideEffectState(`listener:created room=${roomId}`);
	}

	private closeListener(roomId: string) {
		// 判断直播间监听器是否关闭
		if (!this.listenerRecord[roomId] || this.listenerRecord[roomId].closed) {
			this.liveLogger.debug(`直播间 [${roomId}] 连接无需关闭`);
			return;
		}
		// 关闭直播间监听器
		this.listenerRecord[roomId].close();
		// 判断是否关闭成功
		if (this.listenerRecord[roomId].closed) {
			// 删除直播间监听器
			delete this.listenerRecord[roomId];
			this.liveLogger.info(`直播间 [${roomId}] 连接已关闭`);
			this.logSideEffectState(`listener:closed room=${roomId}`);
			// 直接返回
			return;
		}
		// 未关闭成功
		this.liveLogger.error(`直播间 [${roomId}] 连接关闭失败`);
	}

	public clearListeners() {
		this.logSideEffectState("listeners:before-clear");
		// 关闭所有监听器
		for (const key of Object.keys(this.listenerRecord)) {
			// 关闭监听器
			this.closeListener(key);
			// 清空记录
			delete this.listenerRecord[key];
		}
		this.listenerRecord = {};
		this.logSideEffectState("listeners:after-clear");
	}

	public clearPushTimers() {
		this.logSideEffectState("timers:before-clear");
		// 清除所有定时器
		for (const [_, timer] of this.livePushTimerManager) {
			// 关闭定时器
			timer?.();
		}
		this.livePushTimerManager.clear();
		this.logSideEffectState("timers:after-clear");
	}

	private async getLiveRoomInfo(roomId: string): Promise<LiveRoomInfo["data"]> {
		// 发送请求获取直播间信息
		const data = await withRetry(
			async () => await this.ctx["bilibili-notify-api"].getLiveRoomInfo(roomId),
		)
			.then((content) => content.data)
			.catch((e) => {
				this.liveLogger.error(`获取直播间信息失败：${e.message}`);
			});
		// 发送私聊消息并重启服务
		if (!data) {
			await this.ctx["bilibili-notify-push"].sendPrivateMsgAndStopService();
			return;
		}
		// 返回
		return data;
	}

	private async getMasterInfo(
		uid: string,
		masterInfo: MasterInfo,
		liveType: LiveType,
	): Promise<MasterInfo> {
		// 获取主播信息
		const { data } = (await this.ctx["bilibili-notify-api"].getMasterInfo(
			uid,
		)) as MasterInfoR;
		// 定义粉丝数变量
		let liveOpenFollowerNum: number;
		let liveEndFollowerNum: number;
		let liveFollowerChange: number;
		// 判断直播状态
		if (
			liveType === LiveType.StartBroadcasting ||
			liveType === LiveType.FirstLiveBroadcast
		) {
			// 第一次启动或刚开播
			// 将当前粉丝数赋值给liveOpenFollowerNum、liveEndFollowerNum
			liveOpenFollowerNum = data.follower_num;
			liveEndFollowerNum = data.follower_num;
			// 将粉丝数变化赋值为0
			liveFollowerChange = 0;
		}
		if (
			liveType === LiveType.StopBroadcast ||
			liveType === LiveType.LiveBroadcast
		) {
			// 将上一次的liveOpenFollowerNum赋值给本次的liveOpenFollowerNum
			liveOpenFollowerNum = masterInfo.liveOpenFollowerNum;
			// 将当前粉丝数赋值给liveEndFollowerNum
			liveEndFollowerNum = data.follower_num;
			// 计算粉丝数变化量
			liveFollowerChange = liveEndFollowerNum - masterInfo.liveOpenFollowerNum;
		}
		// 返回值
		return {
			username: data.info.uname,
			userface: data.info.face,
			roomId: data.room_id,
			liveOpenFollowerNum,
			liveEndFollowerNum,
			liveFollowerChange,
			medalName: data.medal_name,
		};
	}

	private async sendLiveNotifyCard(
		liveType: LiveType,
		liveData: LiveData,
		liveInfo: {
			liveRoomInfo: LiveRoomInfo["data"];
			masterInfo: MasterInfo;
			cardStyle: Subscription["customCardStyle"];
		},
		uid: string,
		liveNotifyMsg: string,
	) {
		// 生成图片
		const buffer = await withRetry(async () => {
			// 获取直播通知卡片
			return await this.ctx["bilibili-notify-generate-img"].generateLiveImg(
				liveInfo.liveRoomInfo,
				liveInfo.masterInfo.username,
				liveInfo.masterInfo.userface,
				liveData,
				liveType,
				liveInfo.cardStyle.enable ? liveInfo.cardStyle : undefined,
			);
		}, 1).catch((e) => {
			this.liveLogger.error(`生成直播图片失败：${e.message}`);
		});
		if (this.isDisposed()) return;
		// 发送私聊消息并重启服务
		if (!buffer)
			return await this.ctx[
				"bilibili-notify-push"
			].sendPrivateMsgAndStopService();
		// 推送直播信息
		const msg = h("message", [
			h.image(buffer, "image/jpeg"),
			h.text(liveNotifyMsg || ""),
		]);
		// 只有在开播时才艾特全体成员
		return await this.ctx["bilibili-notify-push"].broadcastToTargets(
			uid,
			msg,
			liveType === LiveType.StartBroadcasting
				? PushType.StartBroadcasting
				: PushType.Live,
		);
	}

	private segmentDanmaku(
		danmaku: string,
		danmakuWeightRecord: Record<string, number>,
	) {
		// 分词
		this._jieba
			.cut(danmaku, true)
			.filter((word) => word.length >= 2 && !this.stopwords.has(word))
			.forEach((w) => {
				danmakuWeightRecord[w] = (danmakuWeightRecord[w] || 0) + 1;
			});
	}

	private addUserToDanmakuMaker(
		username: string,
		danmakuMakerRecord: Record<string, number>,
	) {
		danmakuMakerRecord[username] = (danmakuMakerRecord[username] || 0) + 1;
	}

	public async liveDetectWithListener(sub: Subscription) {
		// 定义开播时间
		let liveTime: string;
		// 定义定时推送定时器
		let pushAtTimeTimer: () => void;
		// 定义弹幕存放数组
		const danmakuWeightRecord: Record<string, number> = {};
		// 定义发送者及发言条数
		const danmakuSenderRecord: Record<string, number> = {};
		// 定义开播状态
		let liveStatus = false;
		// 定义数据
		let liveRoomInfo: LiveRoomInfo["data"];
		let masterInfo: MasterInfo;
		const liveData: LiveData = { likedNum: "0" };
		// 定义函数
		const sendDanmakuWordCloudAndLiveSummary = async (
			customLiveSummary: string,
		) => {
			/* 制作弹幕词云 */
			this.liveLogger.debug("开始制作弹幕词云");
			this.liveLogger.debug("获取前90热词");
			// 获取数据
			const words = Object.entries(danmakuWeightRecord);
			const danmaker = Object.entries(danmakuSenderRecord);
			// 获取img
			const img = await (async () => {
				// 判断是否不足50词
				if (words.length < 50) {
					// logger
					this.liveLogger.debug("热词不足50个，放弃生成弹幕词云");
					// 返回
					return;
				}
				// 拿到前90个热词
				const top90Words = words.sort((a, b) => b[1] - a[1]).slice(0, 90);
				this.liveLogger.debug("整理弹幕词云前90词及权重");
				this.liveLogger.debug(top90Words);
				this.liveLogger.debug("准备生成弹幕词云");
				// 生成弹幕词云图片
				const buffer = await this.ctx[
					"bilibili-notify-generate-img"
				].generateWordCloudImg(top90Words, masterInfo.username);
				// 构建图片消息
				return h.image(buffer, "image/jpeg");
			})();
			// 获取summary
			const summary = await (async () => {
				// 判断是否不足五人发言
				if (danmaker.length < 5) {
					// logger
					this.liveLogger.debug("发言人数不足5位，放弃生成弹幕词云");
					// 返回
					return;
				}
				// logger
				this.liveLogger.debug("开始构建弹幕发送排行榜消息");
				// 弹幕发送者数量
				const danmakuSenderCount = Object.keys(danmakuSenderRecord).length;
				// 弹幕条数
				const danmakuCount = Object.values(danmakuSenderRecord).reduce(
					(sum, val) => sum + val,
					0,
				);
				// 构建弹幕发送者排行
				const top5DanmakuSender: Array<[string, number]> = Object.entries(
					danmakuSenderRecord,
				)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 5);
				// 判断是否开启AI
				if (this.config.ai.enable) {
					this.liveLogger.debug("生成 AI 直播总结");
					// 拿到前10个热词
					const top10Words = words.sort((a, b) => b[1] - a[1]).slice(0, 10);
					// 直播总结数据
					const liveSummaryData = {
						medalName: masterInfo.medalName,
						danmakuSenderCount,
						danmakuCount,
						top5DanmakuSender,
						top10Words,
						liveStartTime: liveTime,
						liveEndTime: DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss"),
					};
					// 获取AI生成的直播总结
					const res = await this.ctx["bilibili-notify-api"].chatWithAI(
						`请你生成直播总结，用这样的风格，多使用emoji并且替换示例中的emoji，同时要对每个人进行个性化点评，以下是风格参考：
						
						🔍【弹幕情报站】本场直播数据如下：
						🧍‍♂️ 总共 XX 位 (这里用medalName) 上线
						💬 共计 XXX 条弹幕飞驰而过
						📊 热词云图已生成，快来看看你有没有上榜！
						👑 本场顶级输出选手：
						🥇 XXX - 弹幕输出 XX 条，(这里进行吐槽)  
						🥈 XXX - 弹幕 XX 条，(这里进行吐槽)    
						🥉 XXX - 弹幕 XX 条，(这里进行吐槽)  
						🎖️ 特别嘉奖：XXX（这里进行吐槽） & XXX（这里进行吐槽）。  
						别以为发这么点弹幕就能糊弄过去，本兔可是盯着你们的！下次再偷懒小心被我踹飞！🐰🥕

						以下是直播数据：${JSON.stringify(liveSummaryData)}`,
					);
					// logger
					this.liveLogger.debug("AI 直播总结生成完毕");
					this.liveLogger.debug(res.choices[0].message.content);
					// 返回结果
					return res.choices[0].message.content;
				}

				// 构建消息
				return customLiveSummary
					.replace("-dmc", `${danmakuSenderCount}`)
					.replace("-mdn", masterInfo.medalName)
					.replace("-dca", `${danmakuCount}`)
					.replace("-un1", top5DanmakuSender[0][0])
					.replace("-dc1", `${top5DanmakuSender[0][1]}`)
					.replace("-un2", top5DanmakuSender[1][0])
					.replace("-dc2", `${top5DanmakuSender[1][1]}`)
					.replace("-un3", top5DanmakuSender[2][0])
					.replace("-dc3", `${top5DanmakuSender[2][1]}`)
					.replace("-un4", top5DanmakuSender[3][0])
					.replace("-dc4", `${top5DanmakuSender[3][1]}`)
					.replace("-un5", top5DanmakuSender[4][0])
					.replace("-dc5", `${top5DanmakuSender[4][1]}`)
					.replaceAll("\\n", "\n");
			})();
			if (this.isDisposed()) return;
			// 发送消息
			await this.ctx["bilibili-notify-push"].broadcastToTargets(
				sub.uid,
				[img, summary],
				PushType.WordCloudAndLiveSummary,
			);
			// 清理弹幕数据
			Object.keys(danmakuWeightRecord).forEach((key) => {
				delete danmakuWeightRecord[key];
			});
			Object.keys(danmakuSenderRecord).forEach((key) => {
				delete danmakuSenderRecord[key];
			});
		};

		// 定义定时推送函数
		const pushAtTimeFunc = async () => {
			// 判断是否信息是否获取成功
			if (
				!(await useLiveRoomInfo(LiveType.LiveBroadcast)) ||
				!(await useMasterInfo(LiveType.LiveBroadcast))
			) {
				// 未获取成功，直接返回
				await this.ctx["bilibili-notify-push"].sendPrivateMsg(
					"获取直播间信息失败，推送直播卡片失败",
				);
				// 停止服务
				return await this.ctx[
					"bilibili-notify-push"
				].sendPrivateMsgAndStopService();
			}
			// 判断是否已经下播
			if (liveRoomInfo.live_status === 0 || liveRoomInfo.live_status === 2) {
				// 设置开播状态为false
				liveStatus = false;
				// 清除定时器
				pushAtTimeTimer?.();
				// 发送私聊消息
				await this.ctx["bilibili-notify-push"].sendPrivateMsg(
					"直播间已下播，可能与直播间的连接断开，请使用 `bn restart` 重启插件",
				);
				// 返回
				return;
			}
			// 设置开播时间
			liveTime = liveRoomInfo.live_time;
			// 获取watched
			const watched = liveData.watchedNum || "暂未获取到";
			//设置到liveData
			liveData.watchedNum = watched;
			// 设置直播中消息
			const liveMsg = sub.customLiveMsg.customLive
				.replace("-name", masterInfo.username)
				.replace(
					"-time",
					await this.ctx["bilibili-notify-generate-img"].getTimeDifference(
						liveTime,
					),
				)
				.replace("-watched", watched)
				.replaceAll("\\n", "\n")
				.replace(
					"-link",
					`https://live.bilibili.com/${liveRoomInfo.short_id === 0 ? liveRoomInfo.room_id : liveRoomInfo.short_id}`,
				);
			// 发送直播通知卡片
			await this.sendLiveNotifyCard(
				LiveType.LiveBroadcast,
				liveData,
				{
					liveRoomInfo,
					masterInfo,
					cardStyle: sub.customCardStyle,
				},
				sub.uid,
				liveMsg,
			);
		};

		const useMasterInfo = async (liveType: LiveType) => {
			// 定义函数是否执行成功flag
			let flag = true;
			// 获取主播信息(需要满足flag为true，liveRoomInfo.uid有值)
			masterInfo = await this.getMasterInfo(
				liveRoomInfo.uid.toString(),
				masterInfo,
				liveType,
			).catch(() => {
				// 设置flag为false
				flag = false;
				// 返回空
				return null;
			});
			// 返回信息
			return flag;
		};

		// 定义直播间信息获取函数
		const useLiveRoomInfo = async (liveType: LiveType) => {
			// 定义函数是否执行成功flag
			let flag = true;
			// 获取直播间信息
			const data = await this.getLiveRoomInfo(sub.roomid).catch(() => {
				// 设置flag为false
				flag = false;
			});
			// 判断是否成功获取信息
			if (!flag || !data || !data.uid) {
				// 上一步未成功
				flag = false;
				// 返回flag
				return flag;
			}
			// 如果是开播或第一次订阅
			if (
				liveType === LiveType.StartBroadcasting ||
				liveType === LiveType.FirstLiveBroadcast
			) {
				liveRoomInfo = data;
				// 返回
				return true;
			}
			// 不更新开播时间
			liveRoomInfo = replaceButKeep(liveRoomInfo, data, ["live_time"]);
			return true;
		};

		/* 
			直播监听相关
		*/

		// 事件冷却时间（毫秒）
		const LIVE_EVENT_COOLDOWN = 10 * 1000; // 10 秒

		// 记录上次事件触发时间
		let lastLiveStart = 0;
		let lastLiveEnd = 0;

		const handler: MsgHandler = {
			onError: async () => {
				liveStatus = false;
				pushAtTimeTimer?.();
				pushAtTimeTimer = null;
				this.closeListener(sub.roomid);
				if (this.isDisposed()) return;
				await this.ctx["bilibili-notify-push"].sendPrivateMsg(
					`[${sub.roomid}] 直播间连接发生错误`,
				);
				this.liveLogger.error(`[${sub.roomid}] 直播间连接发生错误`);
			},

			onIncomeDanmu: ({ body }) => {
				this.segmentDanmaku(body.content, danmakuWeightRecord);
				this.addUserToDanmakuMaker(body.user.uname, danmakuSenderRecord);
				// 判断是否开启特定用户弹幕监测
				if (
					sub.customSpecialDanmakuUsers.enable &&
					sub.customSpecialDanmakuUsers.specialDanmakuUsers?.includes(
						body.user.uid.toString(),
					)
				) {
					const msgTemplate = sub.customSpecialDanmakuUsers.msgTemplate
						.replace("-mastername", masterInfo.username)
						.replace("-uname", body.user.uname)
						.replace("-msg", body.content);
					// 推送
					const content = h("message", [h.text(msgTemplate)]);
					if (this.isDisposed()) return;
					this.ctx["bilibili-notify-push"].broadcastToTargets(
						sub.uid,
						content,
						PushType.UserDanmakuMsg,
					);
				}
			},

			onIncomeSuperChat: async ({ body }) => {
				this.segmentDanmaku(body.content, danmakuWeightRecord);
				this.addUserToDanmakuMaker(body.user.uname, danmakuSenderRecord);
				// 获取用户信息
				const data = await this.ctx["bilibili-notify-api"].getUserInfoInLive(
					body.user.uid.toString(),
					sub.uid,
				);
				// 判断是否获取成功
				if (data.code !== 0) {
					// 获取失败，通过文字发送通知
					const content = h("message", [
						h.text(
							`【${masterInfo.username}的直播间】${body.user.uname}的SC:${body.content}（${body.price}元）`,
						),
					]);
					// 推送
					if (this.isDisposed()) return;
					return this.ctx["bilibili-notify-push"].broadcastToTargets(
						sub.uid,
						content,
						PushType.Superchat,
					);
				}
				// 解析用户信息
				const userInfo: UserInfoInLiveData = data.data;
				// 生成图片
				const buffer = await this.ctx[
					"bilibili-notify-generate-img"
				].generateSCImg({
					senderFace: userInfo.face,
					senderName: userInfo.uname,
					masterName: masterInfo.username,
					masterAvatarUrl: masterInfo.userface,
					text: body.content,
					price: body.price,
				});
				if (this.isDisposed()) return;
				// 推送
				const image = h.image(buffer, "image/jpeg");
				if (this.isDisposed()) return;
				this.ctx["bilibili-notify-push"].broadcastToTargets(
					sub.uid,
					image,
					PushType.Superchat,
				);
			},

			onWatchedChange: ({ body }) => {
				liveData.watchedNum = body.text_small;
			},

			onLikedChange: ({ body }) => {
				liveData.likedNum = body.count.toString();
			},

			onGuardBuy: async ({ body }) => {
				const msg = await (async () => {
					if (sub.customGuardBuy.enable) {
						// 舰长图片
						const guardImg = {
							[GuardLevel.Jianzhang]: sub.customGuardBuy.captainImgUrl,
							[GuardLevel.Tidu]: sub.customGuardBuy.supervisorImgUrl,
							[GuardLevel.Zongdu]: sub.customGuardBuy.governorImgUrl,
						};
						// 构建消息
						const msg = sub.customGuardBuy.guardBuyMsg
							.replace("-uname", body.user.uname)
							.replace("-mname", masterInfo.username)
							.replace("-guard", body.gift_name);
						// 发送消息
						return h("message", [
							h.image(guardImg[body.guard_level]),
							h.text(msg),
						]);
					} else {
						// 判断舰长等级
						const guardImg: string =
							BilibiliNotifyLive.GUARD_LEVEL_IMG[body.guard_level];
						// 获取用户信息
						const data = await this.ctx[
							"bilibili-notify-api"
						].getUserInfoInLive(body.user.uid.toString(), sub.uid);
						// 判断是否获取成功
						if (data.code !== 0) {
							// 获取失败，通过文字发送通知
							const content = h("message", [
								h.image(guardImg),
								h.text(
									`【${masterInfo.username}的直播间】${body.user.uname}加入了大航海（${body.gift_name}）`,
								),
							]);
							// 推送
							if (this.isDisposed()) return;
							return this.ctx["bilibili-notify-push"].broadcastToTargets(
								sub.uid,
								content,
								PushType.LiveGuardBuy,
							);
						}
						// 解析用户信息
						const userInfo: UserInfoInLiveData = data.data;
						// 生成图片
						const buffer = await this.ctx[
							"bilibili-notify-generate-img"
						].generateBoardingImg(
							guardImg,
							{
								guardLevel: body.guard_level,
								uname: userInfo.uname,
								face: userInfo.face,
								isAdmin: userInfo.is_admin,
							},
							{
								masterName: masterInfo.username,
								masterAvatarUrl: masterInfo.userface,
							},
						);
						if (this.isDisposed()) return;
						// 构建消息
						return h.image(buffer, "image/jpeg");
					}
				})();
				if (this.isDisposed() || !msg) return;
				// 推送
				this.ctx["bilibili-notify-push"].broadcastToTargets(
					sub.uid,
					msg,
					PushType.LiveGuardBuy,
				);
			},

			onLiveStart: async () => {
				const now = Date.now();

				// 冷却期保护
				if (now - lastLiveStart < LIVE_EVENT_COOLDOWN) {
					this.liveLogger.warn(`[${sub.roomid}] 的开播事件在冷却期内，忽略`);
					return;
				}

				lastLiveStart = now;

				// 状态守卫
				if (liveStatus) {
					this.liveLogger.warn(
						`[${sub.roomid}] 已经是开播状态，忽略重复的开播事件`,
					);
					return;
				}

				liveStatus = true;

				if (
					!(await useLiveRoomInfo(LiveType.StartBroadcasting)) ||
					!(await useMasterInfo(LiveType.StartBroadcasting))
				) {
					liveStatus = false;
					if (this.isDisposed()) return;
					await this.ctx["bilibili-notify-push"].sendPrivateMsg(
						"获取直播间信息失败，推送直播开播卡片失败",
					);
					return await this.ctx[
						"bilibili-notify-push"
					].sendPrivateMsgAndStopService();
				}

				// fans number log
				this.liveLogger.info(
					`房间号：${masterInfo.roomId}，开播时的粉丝数：${masterInfo.liveOpenFollowerNum}`,
				);

				liveTime =
					liveRoomInfo?.live_time ||
					DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss"); // 兜底

				const diffTime =
					await this.ctx["bilibili-notify-generate-img"].getTimeDifference(
						liveTime,
					);

				const followerNum =
					masterInfo.liveOpenFollowerNum >= 10_000
						? `${(masterInfo.liveOpenFollowerNum / 10000).toFixed(1)}万`
						: masterInfo.liveOpenFollowerNum.toString();

				// 将粉丝数设置到liveData
				liveData.fansNum = followerNum;

				const liveStartMsg = sub.customLiveMsg.customLiveStart
					.replace("-name", masterInfo.username)
					.replace("-time", diffTime)
					.replace("-follower", followerNum)
					.replaceAll("\\n", "\n")
					.replace(
						"-link",
						`https://live.bilibili.com/${
							liveRoomInfo.short_id === 0
								? liveRoomInfo.room_id
								: liveRoomInfo.short_id
						}`,
					);

				await this.sendLiveNotifyCard(
					LiveType.StartBroadcasting,
					liveData,
					{ liveRoomInfo, masterInfo, cardStyle: sub.customCardStyle },
					sub.uid,
					liveStartMsg,
				);

				// 定时器安全开启
				if (this.isDisposed()) return;
				if (this.config.pushTime !== 0 && !pushAtTimeTimer) {
					pushAtTimeTimer = this.ctx.setInterval(
						pushAtTimeFunc,
						this.config.pushTime * 1000 * 60 * 60,
					);
					this.livePushTimerManager.set(sub.roomid, pushAtTimeTimer);
					this.logSideEffectState(`timer:created room=${sub.roomid}`);
				}
			},

			onLiveEnd: async () => {
				const now = Date.now();

				// 冷却期保护
				if (now - lastLiveEnd < LIVE_EVENT_COOLDOWN) {
					this.liveLogger.warn(`[${sub.roomid}] 的下播事件在冷却期内，忽略`);
					return;
				}

				lastLiveEnd = now;

				// 状态守卫
				if (!liveStatus) {
					this.liveLogger.warn(
						`[${sub.roomid}] 已经是下播状态，忽略重复的下播事件`,
					);
					return;
				}

				// 定时器安全关闭
				if (pushAtTimeTimer) {
					pushAtTimeTimer();
					pushAtTimeTimer = null;
					this.livePushTimerManager.delete(sub.roomid);
					this.logSideEffectState(`timer:deleted room=${sub.roomid}`);
				}

				// 获取信息
				if (
					!(await useLiveRoomInfo(LiveType.StopBroadcast)) ||
					!(await useMasterInfo(LiveType.StopBroadcast))
				) {
					liveStatus = false;
					if (this.isDisposed()) return;
					await this.ctx["bilibili-notify-push"].sendPrivateMsg(
						"获取直播间信息失败，推送直播开播卡片失败",
					);
					return await this.ctx[
						"bilibili-notify-push"
					].sendPrivateMsgAndStopService();
				}

				liveStatus = false;

				// fans number log
				this.liveLogger.debug(
					`开播时粉丝数：${masterInfo.liveOpenFollowerNum}，下播时粉丝数：${masterInfo.liveEndFollowerNum}，粉丝数变化：${masterInfo.liveFollowerChange}`,
				);

				// 保证 liveTime 必然有值
				liveTime =
					liveRoomInfo?.live_time ||
					DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss");

				const diffTime =
					await this.ctx["bilibili-notify-generate-img"].getTimeDifference(
						liveTime,
					);

				const followerChange = (() => {
					const liveFollowerChangeNum = masterInfo.liveFollowerChange;
					if (liveFollowerChangeNum > 0) {
						return liveFollowerChangeNum >= 10_000
							? `+${(liveFollowerChangeNum / 10000).toFixed(1)}万`
							: `+${liveFollowerChangeNum}`;
					}
					return liveFollowerChangeNum <= -10_000
						? `${(liveFollowerChangeNum / 10000).toFixed(1)}万`
						: liveFollowerChangeNum.toString();
				})();

				// 将粉丝数变化设置到liveData
				liveData.fansChanged = followerChange;

				const liveEndMsg = sub.customLiveMsg.customLiveEnd
					.replace("-name", masterInfo.username)
					.replace("-time", diffTime)
					.replace("-follower_change", followerChange)
					.replaceAll("\\n", "\n");

				// 判断是否推送下播
				if (sub.liveEnd) {
					// 推送下播卡片
					await this.sendLiveNotifyCard(
						LiveType.StopBroadcast,
						liveData,
						{ liveRoomInfo, masterInfo, cardStyle: sub.customCardStyle },
						sub.uid,
						liveEndMsg,
					);
					// 推送弹幕词云和直播总结
					await sendDanmakuWordCloudAndLiveSummary(
						sub.customLiveSummary.liveSummary as string,
					);
				}
			},
		};

		const userAction: MsgHandler = {
			/* raw: {
				INTERACT_WORD_V2: async (msg) => {
					// 监听所有 cmd 消息
					const data = await this.decodeBase64PB(msg.data.pb);
					// 判断是否有特别关注用户进入直播间
					if (
						data.msgType === "1" &&
						sub.customSpecialUsersEnterTheRoom.specialUsersEnterTheRoom?.includes(
							data.uid,
						)
					) {
						const msgTemplate = sub.customSpecialUsersEnterTheRoom.msgTemplate
							.replace("-mastername", masterInfo.username)
							.replace("-uname", data.uname);
						// 推送
						const content = h("message", [h.text(msgTemplate)]);
						this.ctx["bilibili-notify-push"].broadcastToTargets(
							sub.uid,
							content,
							PushType.UserActions,
						);
					}
				},
			}, */
			onUserAction: async ({ body }) => {
				// 监听用户进入直播间事件
				if (
					body.action === "enter" &&
					sub.customSpecialUsersEnterTheRoom.specialUsersEnterTheRoom?.includes(
						body.user.uid.toString(),
					)
				) {
					const msgTemplate = sub.customSpecialUsersEnterTheRoom.msgTemplate
						.replace("-mastername", masterInfo.username)
						.replace("-uname", body.user.uname);
					// 推送
					const content = h("message", [h.text(msgTemplate)]);
					if (this.isDisposed()) return;
					this.ctx["bilibili-notify-push"].broadcastToTargets(
						sub.uid,
						content,
						PushType.UserActions,
					);
				}
			},
		};

		// 启动直播间弹幕监测
		await this.startLiveRoomListener(sub.roomid, {
			...handler,
			...(sub.customSpecialUsersEnterTheRoom.enable ? userAction : {}), // 判断是否需要开启用户进入直播间监听
		});
		// 第一次启动获取信息并判信息是否获取成功
		if (
			!(await useLiveRoomInfo(LiveType.FirstLiveBroadcast)) ||
			!(await useMasterInfo(LiveType.FirstLiveBroadcast))
		) {
			// 未获取成功，直接返回
			return this.ctx["bilibili-notify-push"].sendPrivateMsg(
				"获取直播间信息失败，启动直播间弹幕检测失败",
			);
		}
		// fans number log
		this.liveLogger.debug(`当前粉丝数：${masterInfo.liveOpenFollowerNum}`);
		// 判断直播状态
		if (liveRoomInfo.live_status === 1) {
			// 设置开播时间
			liveTime = liveRoomInfo.live_time;
			// 获取当前累计观看人数
			const watched = liveData.watchedNum || "暂未获取到";
			// 设置到liveData
			liveData.watchedNum = watched;
			// 定义直播中通知消息
			const liveMsg = sub.customLiveMsg.customLive
				.replace("-name", masterInfo.username)
				.replace(
					"-time",
					await this.ctx["bilibili-notify-generate-img"].getTimeDifference(
						liveTime,
					),
				)
				.replace("-watched", watched)
				.replaceAll("\\n", "\n")
				.replace(
					"-link",
					`https://live.bilibili.com/${liveRoomInfo.short_id === 0 ? liveRoomInfo.room_id : liveRoomInfo.short_id}`,
				);
			// 发送直播通知卡片
			if (this.config.restartPush) {
				this.sendLiveNotifyCard(
					LiveType.LiveBroadcast,
					liveData,
					{
						liveRoomInfo,
						masterInfo,
						cardStyle: sub.customCardStyle,
					},
					sub.uid,
					liveMsg,
				);
			}
			// 正在直播，开启定时器，判断定时器是否已开启
			if (this.config.pushTime !== 0 && !pushAtTimeTimer) {
				// 开始直播，开启定时器
				pushAtTimeTimer = this.ctx.setInterval(
					pushAtTimeFunc,
					this.config.pushTime * 1000 * 60 * 60,
				);
				// 将定时器送入管理器
				this.livePushTimerManager.set(sub.roomid, pushAtTimeTimer);
				this.logSideEffectState(`timer:created room=${sub.roomid}`);
			}
			// 设置直播状态为true
			liveStatus = true;
		}
	}
}

namespace BilibiliNotifyLive {
	export interface Config {
		logLevel: number;
		wordcloudStopWords: string;
		ai: {
			enable: boolean;
			apiKey: string;
			baseURL: string;
			model: string;
			persona: string;
		};
		pushTime: number;
		restartPush: boolean;
	}

	export const Config: Schema<Config> = Schema.object({
		logLevel: Schema.number().required(),
		wordcloudStopWords: Schema.string(),
		ai: Schema.object({
			enable: Schema.boolean().default(false),
			apiKey: Schema.string().default(""),
			baseURL: Schema.string().default("https://api.siliconflow.cn/v1"),
			model: Schema.string().default("gpt-3.5-turbo"),
			persona: Schema.string(),
		}),
		pushTime: Schema.number().required(),
		restartPush: Schema.boolean().required(),
	});

	// 舰长图片
	export const GUARD_LEVEL_IMG = {
		[GuardLevel.Jianzhang]:
			"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/captain-Bjw5Byb5.png",
		[GuardLevel.Tidu]:
			"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/supervisor-u43ElIjU.png",
		[GuardLevel.Zongdu]:
			"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/governor-DpDXKEdA.png",
	};
}

export default BilibiliNotifyLive;
