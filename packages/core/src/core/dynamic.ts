import { CronJob } from "cron";
import { type Awaitable, type Context, h, Logger, Schema, Service } from "koishi";
import { DateTime } from "luxon";
import {
	type AllDynamicInfo,
	type DynamicTimelineManager,
	PushType,
	type SubManager,
} from "../type";
import { withLock, withRetry } from "../utils";
import { DynamicFilterReason, filterDynamic } from "./dynamic_filter";

declare module "koishi" {
	interface Context {
		"bilibili-notify-dynamic": BilibiliNotifyDynamic;
	}
}

const BILIBILI_NOTIFY_DYNAMIC = "bilibili-notify-dynamic";

class BilibiliNotifyDynamic extends Service<BilibiliNotifyDynamic.Config> {
	// 依赖
	static inject = [
		"bilibili-notify-api",
		"bilibili-notify-generate-img",
		"bilibili-notify-push",
	];
	// logger
	private dynamicLogger: Logger;
	// 动态检测销毁函数
	private dynamicJob: CronJob;
	// 动态订阅管理器
	private dynamicSubManager: SubManager;
	// 动态时间线管理器
	private dynamicTimelineManager: DynamicTimelineManager;
	// 构造函数
	constructor(ctx: Context, config: BilibiliNotifyDynamic.Config) {
		super(ctx, BILIBILI_NOTIFY_DYNAMIC);
		// 配置
		this.config = config;
		// logger
		this.dynamicLogger = new Logger(BILIBILI_NOTIFY_DYNAMIC);
		this.dynamicLogger.level = this.config.logLevel;
	}
	protected start(): Awaitable<void> {
		// 初始化动态时间线管理器
		this.dynamicTimelineManager = new Map();
	}
	protected stop(): Awaitable<void> {
		// 停止动态检测任务
		if (this.dynamicJob) {
			this.dynamicJob.stop();
			this.dynamicLogger.info("动态检测任务已停止");
		}
	}
	// 获取动态检测状态
	get isActive() {
		return this.dynamicJob?.isActive ?? false;
	}
	// 启动函数
	startDynamicDetector(subManager: SubManager) {
		// 判断是否已经存在动态检测任务
		if (this.dynamicJob) {
			this.dynamicLogger.warn("动态检测任务已存在，跳过创建新的任务");
			return;
		}
		// 判断是否有订阅对象
		if (subManager.size === 0) {
			this.dynamicLogger.warn("没有订阅对象，跳过创建动态检测任务");
			return;
		}
		// 只保留需要动态检测的订阅对象
		const dynamicSubManager: SubManager = new Map();
		// 判断哪些订阅对象需要动态检测
		for (const [uid, sub] of subManager) {
			// 判断是否需要动态检测
			if (sub.dynamic) {
				// 初始化动态时间线管理器
				this.dynamicTimelineManager.set(
					uid,
					Math.floor(DateTime.now().toSeconds()),
				);
				// 记录需要动态检测的订阅对象
				dynamicSubManager.set(uid, sub);
			}
		}
		// 记录订阅管理器
		this.dynamicSubManager = dynamicSubManager;
		// 创建新的动态检测任务
		this.dynamicJob = new CronJob(
			this.config.dynamicCron,
			this.dynamicDetector(),
		);
		// 启动任务
		this.dynamicJob.start();
		// 记录日志
		this.dynamicLogger.info("动态检测任务已启动");
	}
	// 动态检测器
	private dynamicDetector() {
		// 定义handler
		const handler = async () => {
			// 定义本次请求推送的动态
			const currentPushDyn: Record<
				string,
				AllDynamicInfo["data"]["items"][number]
			> = {};
			// logger
			this.dynamicLogger.debug(`开始获取动态信息`);
			// 使用withRetry函数进行重试
			const content = await withRetry(async () => {
				// 获取动态内容
				return (await this.ctx[
					"bilibili-notify-api"
				].getAllDynamic()) as AllDynamicInfo;
			}, 1).catch((e) => {
				// logger
				this.dynamicLogger.error(`获取动态失败：${e.message}`);
			});
			// content不存在则直接返回
			if (!content) return;
			// 判断获取动态内容是否成功
			if (content.code !== 0) {
				switch (content.code) {
					case -101: {
						// 账号未登录
						this.dynamicLogger.error(`账号未登录，插件已停止工作，请先登录`);
						// 发送私聊消息
						await this.ctx["bilibili-notify-push"].sendPrivateMsg(
							`账号未登录，插件已停止工作，请先登录`,
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
					case -352: {
						// 风控
						// 输出日志
						this.dynamicLogger.error(
							"账号被风控，插件已停止工作，请使用 `bili cap` 指令解除风控",
						);
						// 发送私聊消息
						await this.ctx["bilibili-notify-push"].sendPrivateMsg(
							"账号被风控，插件已停止工作，请使用 `bili cap` 指令解除风控",
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
					default: {
						// 未知错误
						this.dynamicLogger.error(
							`获取动态信息失败，错误码：${content.code}，错误信息：${content.message}`,
						);
						// 发送私聊消息
						await this.ctx["bilibili-notify-push"].sendPrivateMsg(
							`获取动态信息失败，错误码：${content.code}`,
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
				}
			}
			// logger
			this.dynamicLogger.debug("成功获取动态信息，开始处理");
			// 获取动态内容
			const items = content.data.items;
			// 检查更新的动态
			for (const item of items) {
				// 没有动态内容则直接跳过
				if (!item) continue;
				// 获取动态发布时间
				const postTime = item.modules.module_author.pub_ts;
				// 从动态数据中取出UP主名称、UID
				const uid = item.modules.module_author.mid.toString();
				const name = item.modules.module_author.name;
				// logger
				this.dynamicLogger.debug(
					`获取动态信息：UP主=${name}, UID=${uid}, 发布时间=${DateTime.fromSeconds(postTime).toFormat("yyyy-MM-dd HH:mm:ss")}`,
				);
				// 判断是否存在时间线
				if (this.dynamicTimelineManager.has(uid)) {
					// logger
					this.dynamicLogger.debug("已订阅该UP主，检查动态时间线");
					// 寻找关注的UP主
					const timeline = this.dynamicTimelineManager.get(uid);
					// logger
					this.dynamicLogger.debug(
						`上次推送时间线：${DateTime.fromSeconds(timeline).toFormat("yyyy-MM-dd HH:mm:ss")}`,
					);
					// 判断动态发布时间是否大于时间线
					if (timeline < postTime) {
						// logger
						this.dynamicLogger.debug("该动态需要推送");
						// 获取订阅对象
						const sub = this.dynamicSubManager.get(uid);
						const filterResult = filterDynamic(item, this.config.filter);
						if (filterResult.blocked) {
							if (this.config.filter.notify) {
								const notifyMessageByReason: Record<
									DynamicFilterReason,
									string
								> = {
									[DynamicFilterReason.BlacklistKeyword]: `${name}发布了一条含有屏蔽关键字的动态`,
									[DynamicFilterReason.BlacklistForward]: `${name}转发了一条动态，已屏蔽`,
									[DynamicFilterReason.BlacklistArticle]: `${name}投稿了一条专栏，已屏蔽`,
									[DynamicFilterReason.WhitelistUnmatched]: `${name}发布了一条不在白名单范围内的动态，已屏蔽`,
								};
								await this.ctx["bilibili-notify-push"].broadcastToTargets(
									uid,
									h("message", notifyMessageByReason[filterResult.reason]),
									PushType.Dynamic,
								);
							}
							continue;
						}
						// logger
						this.dynamicLogger.debug("开始渲染推送卡片");
						// 推送该条动态
						const buffer = await withRetry(async () => {
							// 渲染图片
							return await this.ctx[
								"bilibili-notify-generate-img"
							].generateDynamicImg(
								item,
								sub.customCardStyle.enable ? sub.customCardStyle : undefined,
							);
						}, 1).catch(async (e) => {
							// 直播开播动态，不做处理
							if (e.message === "直播开播动态，不做处理") return;
							// 未知错误
							this.dynamicLogger.error(`生成动态图片失败：${e.message}`);
							// 发送私聊消息并重启服务
							await this.ctx[
								"bilibili-notify-push"
							].sendPrivateMsgAndStopService();
						});
						// 判断是否执行成功，未执行成功直接返回
						if (!buffer) continue;
						// logger
						this.dynamicLogger.debug("渲染推送卡片成功");
						// 定义动态链接
						let dUrl = "";
						// 判断是否需要发送URL
						if (this.config.dynamicUrl) {
							// logger
							this.dynamicLogger.debug("生成动态链接");
							// 判断动态类型
							if (item.type === "DYNAMIC_TYPE_AV") {
								// 判断是否开启url to bv
								if (this.config.dynamicVideoUrlToBV) {
									// 截取bv号
									const bv =
										item.modules.module_dynamic.major.archive.jump_url.match(
											/BV[0-9A-Za-z]+/,
										);
									// 获取bv号
									dUrl = bv ? bv[0] : "";
								} else {
									// 生成视频链接
									dUrl = `${name}发布了新视频：https:${item.modules.module_dynamic.major.archive.jump_url}`;
								}
							} else {
								// 生成动态链接
								dUrl = `${name}发布了一条动态：https://t.bilibili.com/${item.id_str}`;
							}
							// logger
							this.dynamicLogger.debug("生成动态链接成功");
						}
						// logger
						this.dynamicLogger.debug("推送动态");
						// 发送推送卡片
						await this.ctx["bilibili-notify-push"].broadcastToTargets(
							uid,
							h("message", [h.image(buffer, "image/jpeg"), h.text(dUrl)]),
							PushType.Dynamic,
						);
						// 判断是否需要发送动态中的图片
						if (this.config.pushImgsInDynamic) {
							// logger
							this.dynamicLogger.debug("发送动态中的图片");
							// 判断是否为图文动态
							if (item.type === "DYNAMIC_TYPE_DRAW") {
								// 获取pics
								const pics = item.modules?.module_dynamic?.major?.opus?.pics;
								// 判断pics是否存在
								if (pics) {
									// 组合消息
									const picsMsg = h(
										"message",
										{ forward: true },
										pics.map((pic) => h.img(pic.url)),
									);
									// 发送消息
									await this.ctx["bilibili-notify-push"].broadcastToTargets(
										uid,
										picsMsg,
										PushType.Dynamic,
									);
								}
							}
							// logger
							this.dynamicLogger.debug("动态中的图片发送完毕");
						}
						// 如果当前订阅对象已存在更早推送，则无需再更新时间线
						if (!currentPushDyn[uid]) {
							// 将当前动态存入currentPushDyn
							currentPushDyn[uid] = item;
						}
						// logger
						this.dynamicLogger.debug("动态推送完成");
					}
				}
			}
			// logger
			this.dynamicLogger.debug("动态信息处理完毕");
			// 遍历currentPushDyn
			for (const uid in currentPushDyn) {
				// 获取动态发布时间
				const postTime = currentPushDyn[uid].modules.module_author.pub_ts;
				// 更新当前时间线
				this.dynamicTimelineManager.set(uid, postTime);
				// logger
				this.dynamicLogger.debug(
					`更新时间线：UP主=${uid}, 时间线=${DateTime.fromSeconds(postTime).toFormat("yyyy-MM-dd HH:mm:ss")}`,
				);
			}
			// logger
			this.dynamicLogger.debug(
				`推送的动态数量：${Object.keys(currentPushDyn).length} 条`,
			);
		};
		// 返回一个闭包函数
		return withLock(handler);
	}
}

namespace BilibiliNotifyDynamic {
	export interface Config {
		logLevel: number;
		filter: {
			enable: boolean;
			notify: boolean;
			regex: string;
			keywords: Array<string>;
			forward: boolean;
			article: boolean;
			whitelistEnable: boolean;
			whitelistRegex: string;
			whitelistKeywords: Array<string>;
		};
		dynamicUrl: boolean;
		dynamicCron: string;
		dynamicVideoUrlToBV: boolean;
		pushImgsInDynamic: boolean;
	}

	export const Config: Schema<Config> = Schema.object({
		logLevel: Schema.number().required(),
		filter: Schema.object({
			enable: Schema.boolean(),
			notify: Schema.boolean(),
			regex: Schema.string(),
			keywords: Schema.array(String),
			forward: Schema.boolean(),
			article: Schema.boolean(),
			whitelistEnable: Schema.boolean(),
			whitelistRegex: Schema.string(),
			whitelistKeywords: Schema.array(String),
		}),
		dynamicUrl: Schema.boolean().required(),
		dynamicCron: Schema.string().required(),
		dynamicVideoUrlToBV: Schema.boolean().required(),
		pushImgsInDynamic: Schema.boolean().required(),
	});
}

export default BilibiliNotifyDynamic;
