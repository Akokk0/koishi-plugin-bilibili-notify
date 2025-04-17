// Koishi核心依赖
import {
	type Bot,
	type Context,
	type FlatPick,
	type Logger,
	Schema,
	h,
} from "koishi";
import type { Notifier } from "@koishijs/plugin-notifier";
import {} from "koishi-plugin-cron";
import {} from "@koishijs/plugin-help";
// 数据库
import type { LoginBili } from "./database";
// 外部依赖：B站直播监听
import type { MsgHandler } from "blive-message-listener";
// 外部依赖：qrcode
import QRCode from "qrcode";
// Utils
import { withLock, withRetry } from "./utils";
// Types
import {
	type AllDynamicInfo,
	type ChannelIdArr,
	LiveType,
	type LiveUsers,
	type MasterInfo,
	type SubItem,
	type SubManager,
	type Target,
} from "./type";
import { DateTime } from "luxon";
// TODO:WorlCloud
// import { Segment, useDefault } from "segmentit";

class ComRegister {
	// 必须服务
	static inject = ["ba", "gi", "database", "bl", "sm", "cron"];
	// 定义数组：QQ相关bot
	qqRelatedBotList: Array<string> = [
		"qq",
		"onebot",
		"red",
		"satori",
		"chronocat",
	];
	// logger
	logger: Logger;
	// config
	config: ComRegister.Config;
	// 登录定时器
	loginTimer: () => void;
	// 订阅数量
	num = 0;
	// 重启次数
	rebootCount = 0;
	// 订阅通知
	subNotifier: Notifier;
	// Context
	ctx: Context;
	// 订阅管理器
	subManager: SubManager = [];
	// 检查登录数据库是否有数据
	loginDBData: FlatPick<LoginBili, "dynamic_group_id">;
	// 机器人实例
	privateBot: Bot<Context>;
	// 动态检测销毁函数
	dynamicDispose: () => void;
	// 发送消息方式
	sendMsgFunc: (
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		bot: Bot<Context, any>,
		channelId: string,
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		content: any,
	) => Promise<void>;
	// 构造函数
	constructor(ctx: Context, config: ComRegister.Config) {
		// 将ctx赋值给类属性
		this.ctx = ctx;
		// 初始化
		this.init(config);
		// 注册指令
		const statusCom = ctx.command("status", "插件状态相关指令", {
			permissions: ["authority:5"],
		});

		statusCom
			.subcommand(".dyn", "查看动态监测运行状态")
			.usage("查看动态监测运行状态")
			.example("status dyn")
			.action(() => {
				if (this.dynamicDispose) {
					return "动态监测正在运行";
				}
				return "动态监测未运行";
			});

		statusCom
			.subcommand(".sm", "查看订阅管理对象")
			.usage("查看订阅管理对象")
			.example("status sm")
			.action(async () => {
				this.logger.info(this.subManager);
				return "查看控制台";
			});

		statusCom
			.subcommand(".bot", "查询当前拥有的机器人信息", { hidden: true })
			.usage("查询当前拥有的机器人信息")
			.example("status bot 查询当前拥有的机器人信息")
			.action(() => {
				this.logger.info("开始输出BOT信息");
				for (const bot of ctx.bots) {
					this.logger.info("--------------------------------");
					this.logger.info(`平台：${bot.platform}`);
					this.logger.info(`名称：${bot.user.name}`);
					this.logger.info("--------------------------------");
				}
			});

		statusCom
			.subcommand(".env", "查询当前环境的信息", { hidden: true })
			.usage("查询当前环境的信息")
			.example("status env 查询当前环境的信息")
			.action(async ({ session }) => {
				await session.send(`Guild ID:${session.event.guild.id}`);
				await session.send(`Channel ID: ${session.event.channel.id}`);
			});

		const biliCom = ctx.command("bili", "bili-notify插件相关指令", {
			permissions: ["authority:3"],
		});

		biliCom
			.subcommand(".login", "登录B站之后才可以进行之后的操作")
			.usage("使用二维码登录，登录B站之后才可以进行之后的操作")
			.example("bili login")
			.action(async ({ session }) => {
				this.logger.info("调用bili login指令");
				// 获取二维码
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				let content: any;
				try {
					content = await ctx.ba.getLoginQRCode();
				} catch (e) {
					return "bili login getLoginQRCode() 本次网络请求失败";
				}
				// 判断是否出问题
				if (content.code !== 0)
					return await session.send("出问题咯，请联系管理员解决");
				// 生成二维码
				QRCode.toBuffer(
					content.data.url,
					{
						errorCorrectionLevel: "H", // 错误更正水平
						type: "png", // 输出类型
						margin: 1, // 边距大小
						color: {
							dark: "#000000", // 二维码颜色
							light: "#FFFFFF", // 背景颜色
						},
					},
					async (err, buffer) => {
						if (err) return await session.send("二维码生成出错，请重新尝试");
						await session.send(h.image(buffer, "image/png"));
					},
				);
				// 检查之前是否存在登录定时器
				if (this.loginTimer) this.loginTimer();
				// 设置flag
				let flag = true;
				// 发起登录请求检查登录状态
				this.loginTimer = ctx.setInterval(async () => {
					try {
						// 判断上一个循环是否完成
						if (!flag) return;
						flag = false;
						// 获取登录信息
						// biome-ignore lint/suspicious/noExplicitAny: <explanation>
						let loginContent: any;
						try {
							loginContent = await ctx.ba.getLoginStatus(
								content.data.qrcode_key,
							);
						} catch (e) {
							this.logger.error(e);
							return;
						}
						if (loginContent.code !== 0) {
							this.loginTimer();
							return await session.send("登录失败请重试");
						}
						if (loginContent.data.code === 86038) {
							this.loginTimer();
							return await session.send("二维码已失效，请重新登录");
						}
						if (loginContent.data.code === 0) {
							// 登录成功
							const encryptedCookies = ctx.ba.encrypt(ctx.ba.getCookies());
							const encryptedRefreshToken = ctx.ba.encrypt(
								loginContent.data.refresh_token,
							);
							await ctx.database.upsert("loginBili", [
								{
									id: 1,
									bili_cookies: encryptedCookies,
									bili_refresh_token: encryptedRefreshToken,
								},
							]);
							// 销毁定时器
							this.loginTimer();
							// 订阅手动订阅中的订阅
							await this.loadSubFromConfig(config.sub);
							// 清除控制台通知
							ctx.ba.disposeNotifier();
							// 发送成功登录推送
							await session.send("登录成功");
							// bili show
							await session.execute("bili show");
							// 开启cookies刷新检测
							ctx.ba.enableRefreshCookiesDetect();
						}
					} finally {
						flag = true;
					}
				}, 1000);
			});

		biliCom
			.subcommand(".list", "展示订阅对象")
			.usage("展示订阅对象")
			.example("bili list")
			.action(() => {
				const subTable = this.subShow();
				return subTable;
			});

		biliCom
			.subcommand(".private", "向主人账号发送一条测试消息", { hidden: true })
			.usage("向主人账号发送一条测试消息")
			.example("bili private 向主人账号发送一条测试消息")
			.action(async ({ session }) => {
				// 发送消息
				await this.sendPrivateMsg("Hello World");
				// 发送提示
				await session.send(
					"已发送消息，如未收到则说明您的机器人不支持发送私聊消息或您的信息填写有误",
				);
			});

		biliCom
			.subcommand(".ll")
			.usage("展示当前正在直播的订阅对象")
			.example("bili ll")
			.action(async () => {
				// 获取liveUsers
				const {
					data: { live_users },
				} = (await ctx.ba.getTheUserWhoIsLiveStreaming()) as {
					data: { live_users: LiveUsers };
				};
				// 定义当前正在直播且订阅的UP主列表
				const subLiveUsers: Array<{
					uid: number;
					uname: string;
					onLive: boolean;
				}> = [];
				// 获取当前订阅的UP主
				for (const sub of this.subManager) {
					// 定义开播标志位
					let onLive = false;
					// 判断items是否存在
					if (live_users.items) {
						// 遍历liveUsers
						for (const user of live_users.items) {
							// 判断是否是订阅直播的UP
							if (user.mid.toString() === sub.uid && sub.live) {
								// 设置标志位为true
								onLive = true;
								// break
								break;
							}
						}
					}
					// 判断是否未开播
					subLiveUsers.push({
						uid: Number.parseInt(sub.uid),
						uname: sub.uname,
						onLive,
					});
				}
				// 定义table字符串
				let table = "";
				// 遍历liveUsers
				for (const user of subLiveUsers) {
					table += `[UID:${user.uid}] 「${user.uname}」 ${user.onLive ? "正在直播" : "未开播"}\n`;
				}
				return table;
			});
	}

	async init(config: ComRegister.Config) {
		// 设置logger
		this.logger = this.ctx.logger("cr");
		// logger
		this.logger.info("初始化插件中...");
		// 将config设置给类属性
		this.config = config;
		// 拿到私人机器人实例
		this.privateBot = this.ctx.bots.find(
			(bot) => bot.platform === config.master.platform,
		);
		if (!this.privateBot) {
			this.ctx.notifier.create({
				content: "您未配置私人机器人，将无法向您推送机器人状态！",
			});
		}
		// 判断消息发送方式
		if (config.automaticResend) {
			this.sendMsgFunc = async (
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				bot: Bot<Context, any>,
				channelId: string,
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				content: any,
			) => {
				withRetry(async () => await bot.sendMessage(channelId, content)).catch(
					async (e: Error) => {
						if (e.message === "this._request is not a function") {
							// 2S之后重新发送消息
							this.ctx.setTimeout(async () => {
								await this.sendMsgFunc(bot, channelId, content);
							}, 2000);
							// 返回
							return;
						}
						// 打印错误信息
						this.logger.error(
							`发送群组ID:${channelId}消息失败！原因: ${e.message}`,
						);
						await this.sendPrivateMsg(
							`发送群组ID:${channelId}消息失败，请查看日志`,
						);
					},
				);
			};
		} else {
			this.sendMsgFunc = async (
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				bot: Bot<Context, any>,
				channelId: string,
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				content: any,
			) => {
				withRetry(
					async () => await bot.sendMessage(channelId, content),
					1,
				).catch(async (e: Error) => {
					if (e.message === "this._request is not a function") {
						// 2S之后重新发送消息
						this.ctx.setTimeout(async () => {
							await this.sendMsgFunc(bot, channelId, content);
						}, 2000);
						// 返回
						return;
					}
					// 打印错误信息
					this.logger.error(
						`发送群组ID:${channelId}消息失败！原因: ${e.message}`,
					);
					await this.sendPrivateMsg(
						`发送群组ID:${channelId}消息失败，请查看日志`,
					);
				});
			};
		}
		// 检查登录数据库是否有数据
		this.loginDBData = (
			await this.ctx.database.get("loginBili", 1, ["dynamic_group_id"])
		)[0];
		// 判断登录信息是否已加载完毕
		await this.checkIfLoginInfoIsLoaded();
		// 如果未登录，则直接返回
		if (!(await this.checkIfIsLogin())) {
			// log
			this.logger.info("账号未登录，请登录");
			return;
		}
		// 从配置获取订阅
		config.sub && (await this.loadSubFromConfig(config.sub));
		// 检查是否需要动态监测
		this.checkIfDynamicDetectIsNeeded();
		// 在控制台中显示订阅对象
		this.updateSubNotifier();
		// 注册插件销毁函数
		this.ctx.on("dispose", () => {
			// 销毁登录定时器
			if (this.loginTimer) this.loginTimer();
			// 销毁动态监测
			if (this.dynamicDispose) this.dynamicDispose();
		});
		// logger
		this.logger.info("插件初始化完毕！");
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	getBot(pf: string): Bot<Context, any> {
		return this.ctx.bots.find((bot) => bot.platform === pf);
	}

	// TODO:WordCloud
	async test_wordCloud() {
		/* const currentLiveDanmakuArr = []
		// 定义获取弹幕权重Record函数
		const getDanmakuWeightRecord = (): Record<string, number> => {
			// 创建segmentit
			const segmentit = useDefault(new Segment());
			// 创建Record
			const danmakuWeightRecord: Record<string, number> = {};
			// 循环遍历currentLiveDanmakuArr
			for (const danmaku of currentLiveDanmakuArr) {
				// 遍历结果
				segmentit.doSegment(danmaku).map((word: { w: string; p: number }) => {
					// 定义权重
					danmakuWeightRecord[word.w] = (danmakuWeightRecord[word.w] || 0) + 1;
				});
			}
			// 返回Record
			return danmakuWeightRecord;
		}; */

		// Test
		const testTarget: Target = [
			{
				channelIdArr: [
					{
						channelId: "635762054",
						dynamic: true,
						live: false,
						liveGuardBuy: false,
						atAll: false,
					},
				],
				platform: "qqguild",
			},
		];
	}

	async sendPrivateMsg(content: string) {
		if (this.config.master.enable) {
			if (this.config.master.masterAccountGuildId) {
				// 向机器人主人发送消息
				await this.privateBot.sendPrivateMessage(
					this.config.master.masterAccount,
					content,
					this.config.master.masterAccountGuildId,
				);
			} else {
				// 向机器人主人发送消息
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
				"已重启插件三次，请检查机器人状态后使用指令 sys start 启动插件",
			);
			// 重启失败，发送消息
			await this.sendPrivateMsg(
				"已重启插件三次，请检查机器人状态后使用指令 sys start 启动插件",
			);
			// 关闭插件
			await this.ctx.sm.disposePlugin();
			// 结束
			return;
		}
		// 重启次数+1
		this.rebootCount++;
		// logger
		this.logger.info("插件出现未知错误，正在重启插件");
		// 重启插件
		const flag = await this.ctx.sm.restartPlugin();
		// 判断是否重启成功
		if (flag) {
			this.logger.info("重启插件成功");
		} else {
			// logger
			this.logger.error(
				"重启插件失败，请检查机器人状态后使用指令 sys start 启动插件",
			);
			// 重启失败，发送消息
			await this.sendPrivateMsg(
				"重启插件失败，请检查机器人状态后使用指令 sys start 启动插件",
			);
			// 关闭插件
			await this.ctx.sm.disposePlugin();
		}
	}

	async sendPrivateMsgAndStopService() {
		// 发送消息
		await this.sendPrivateMsg(
			"插件发生未知错误，请检查机器人状态后使用指令 sys start 启动插件",
		);
		// logger
		this.logger.error(
			"插件发生未知错误，请检查机器人状态后使用指令 sys start 启动插件",
		);
		// 关闭插件
		await this.ctx.sm.disposePlugin();
		// 结束
		return;
	}

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	async sendMsg(targets: Target, content: any, live?: boolean) {
		for (const target of targets) {
			// 获取机器人实例
			const bot = this.getBot(target.platform);
			// 定义需要发送的数组
			let sendArr: ChannelIdArr = [];
			// 判断是否需要推送所有机器人加入的群
			if (target.channelIdArr[0].channelId === "all") {
				// 获取所有guild
				for (const guild of (await bot.getGuildList()).data) {
					sendArr.push({
						channelId: guild.id,
						dynamic: target.channelIdArr[0].dynamic,
						live: target.channelIdArr[0].live,
						liveGuardBuy: target.channelIdArr[0].liveGuardBuy,
						atAll: target.channelIdArr[0].atAll,
					});
				}
			} else {
				sendArr = target.channelIdArr;
			}
			// 判断是否是直播开播推送，如果是则需要进一步判断是否需要艾特群体成员
			if (live) {
				// 直播开播推送，判断是否需要艾特全体成员
				for (const channel of sendArr) {
					// 判断是否需要推送直播消息
					if (channel.live) {
						await this.sendMsgFunc(bot, channel.channelId, content);
					}
					// 判断是否需要艾特全体成员
					if (channel.atAll) {
						await this.sendMsgFunc(bot, channel.channelId, <at type="all" />);
					}
				}
			} else {
				for (const channel of sendArr) {
					// 判断是否需要推送动态消息
					if (channel.dynamic || channel.live) {
						await this.sendMsgFunc(bot, channel.channelId, content);
					}
				}
			}
		}
	}

	dynamicDetect() {
		// 检测初始化变量
		let detectSetup = true;
		// 时间线
		let timeline: number;
		// 第一条动态的动态ID
		let dynamicIdStr1st: string;
		// 定义handler
		const handler = async () => {
			// 动态监测启动初始化
			if (detectSetup) {
				// logger
				this.logger.info("动态监测初始化中...");
				// 使用withRetry函数进行重试
				const content = await withRetry(async () => {
					// 获取动态内容
					return (await this.ctx.ba.getAllDynamic()) as AllDynamicInfo;
				}, 1).catch((e) => {
					// logger
					this.logger.error(
						`dynamicDetect getAllDynamic() 发生了错误，错误为：${e.message}`,
					);
				});
				// content不存在则直接返回
				if (!content) return;
				// 判断获取动态信息是否成功
				if (content.code !== 0) return;
				// 设置第一条动态的动态ID
				dynamicIdStr1st = content.data?.items[0]?.id_str || "0";
				// 设置时间线
				timeline = content.data?.items[0]?.modules.module_author.pub_ts || DateTime.now().toSeconds();
				// 设置初始化为false
				detectSetup = false;
				// logger
				this.logger.info("动态监测初始化完毕！");
				// 初始化完成
				return;
			}
			// 使用withRetry函数进行重试
			const content = await withRetry(async () => {
				// 获取动态内容
				return (await this.ctx.ba.getAllDynamic()) as AllDynamicInfo;
			}, 1).catch((e) => {
				// logger
				this.logger.error(
					`dynamicDetect getAllDynamic() 发生了错误，错误为：${e.message}`,
				);
			});
			// content不存在则直接返回
			if (!content) return;
			// 判断获取动态内容是否成功
			if (content.code !== 0) {
				switch (content.code) {
					case -101: {
						// 账号未登录
						// 输出日志
						this.logger.error(
							"账号未登录，插件已停止工作，请登录后，输入指令 sys start 启动插件",
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							"账号未登录，插件已停止工作，请登录后，输入指令 sys start 启动插件",
						);
						// 停止服务
						await this.ctx.sm.disposePlugin();
						// 结束循环
						break;
					}
					case -352: {
						// 风控
						// 输出日志
						this.logger.error(
							"账号被风控，插件已停止工作，请确认风控解除后，输入指令 sys start 启动插件",
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							"账号被风控，插件已停止工作，请确认风控解除后，输入指令 sys start 启动插件",
						);
						// 停止服务
						await this.ctx.sm.disposePlugin();
						// 结束循环
						break;
					}
					case 4101128:
					case 4101129: {
						// 获取动态信息错误
						// 输出日志
						this.logger.error(
							`获取动态信息错误，错误码为：${content.code}，错误为：${content.message}`,
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							`获取动态信息错误，错误码为：${content.code}，错误为：${content.message}`,
						); // 未知错误
						// 结束循环
						break;
					}
					default: {
						// 未知错误
						// 发送私聊消息
						await this.sendPrivateMsg(
							`获取动态信息错误，错误码为：${content.code}，错误为：${content.message}`,
						); // 未知错误
						// 结束循环
						break;
					}
				}
			}
			const items = content.data.items;
			// 检查更新的动态
			for (const item of items) {
				// 没有动态内容则直接跳过
				if (!item) continue;
				// 获取动态ID
				const dynamicId = item.id_str;
				// 动态ID如果一致则结束循环
				if (dynamicId === dynamicIdStr1st) break;
				// 判断动态时间戳是否大于时间线
				if (item.modules.module_author.pub_ts > timeline) {
					// 从动态数据中取出UP主名称、UID
					const upUID = item.modules.module_author.mid.toString();
					const upName = item.modules.module_author.name;
					// 寻找关注的UP主的动态
					for (const sub of this.subManager) {
						// 判断是否是订阅的UP主
						if (sub.dynamic && sub.uid === upUID) {
							// 订阅该UP主，推送该动态
							// 推送该条动态
							const buffer = await withRetry(async () => {
								// 渲染图片
								return await this.ctx.gi.generateDynamicImg(item, sub.card);
							}, 1).catch(async (e) => {
								// 直播开播动态，不做处理
								if (e.message === "直播开播动态，不做处理") return;
								if (e.message === "出现关键词，屏蔽该动态") {
									// 如果需要发送才发送
									if (this.config.filter.notify) {
										await this.sendMsg(
											sub.target,
											`${upName}发布了一条含有屏蔽关键字的动态`,
										);
									}
									return;
								}
								if (e.message === "已屏蔽转发动态") {
									if (this.config.filter.notify) {
										await this.sendMsg(
											sub.target,
											`${upName}转发了一条动态，已屏蔽`,
										);
									}
									return;
								}
								// 未知错误
								this.logger.error(
									`dynamicDetect generateDynamicImg() 推送卡片发送失败，原因：${e.message}`,
								);
								// 发送私聊消息并重启服务
								await this.sendPrivateMsgAndStopService();
							});
							// 判断是否执行成功，未执行成功直接返回
							if (!buffer) continue;
							// 判断是否需要发送URL
							const dUrl = this.config.dynamicUrl
								? `${upName}发布了一条动态：https://t.bilibili.com/${dynamicId}`
								: "";
							// logger
							this.logger.info("推送动态中...");
							// 发送推送卡片
							await this.sendMsg(
								sub.target,
								<>
									{h.image(buffer, "image/png")}
									{dUrl}
								</>,
							);
							// 判断是否需要发送动态中的图片
							if (this.config.pushImgsInDynamic) {
								// 判断是否为图文动态，且存在draw
								if (
									item.type === "DYNAMIC_TYPE_DRAW" &&
									item.modules.module_dynamic.major?.draw
								) {
									for (const img of item.modules.module_dynamic.major.draw
										.items) {
										await this.sendMsg(
											sub.target,
											<img src={img.src} alt="动态图片" />,
										);
									}
								}
							}
							// logger
							this.logger.info("动态推送完毕！");
						}
					}
				}
			}
			// 更新本次请求第一条动态的动态ID
			dynamicIdStr1st = items[0].id_str;
			// 更新时间线
			timeline = items[0].modules.module_author.pub_ts || DateTime.now().toSeconds();
		};
		// 返回一个闭包函数
		return withLock(handler);
	}

	debug_dynamicDetect() {
		// 检测初始化变量
		let detectSetup = true;
		// 时间线
		let timeline: number;
		// 第一条动态的动态ID
		let dynamicIdStr1st: string;
		// 定义handler
		const handler = async () => {
			// 动态监测启动初始化
			if (detectSetup) {
				// logger
				this.logger.info("动态监测初始化中...");
				// logger
				this.logger.info("正在获取动态信息...");
				// 使用withRetry函数进行重试
				const content = await withRetry(async () => {
					// 获取动态内容
					return (await this.ctx.ba.getAllDynamic()) as AllDynamicInfo;
				}, 1).catch((e) => {
					// logger
					this.logger.error(
						`dynamicDetect getAllDynamic() 发生了错误，错误为：${e.message}`,
					);
				});
				// content不存在则直接返回
				if (!content) {
					// logger
					this.logger.info("获取动态信息失败！");
					return;
				}
				// 判断获取动态信息是否成功
				if (content.code !== 0) {
					// logger
					this.logger.info("获取动态信息失败！");
					return;
				}
				// 设置第一条动态的动态ID
				dynamicIdStr1st = content.data?.items[0]?.id_str || "0";
				// logger
				this.logger.info(`获取到第一条动态ID:${dynamicIdStr1st}`);
				// 设置时间线
				timeline = content.data?.items[0]?.modules.module_author.pub_ts || DateTime.now().toSeconds();
				// logger
				this.logger.info(`获取到时间线信息:${timeline}`);
				// 设置初始化为false
				detectSetup = false;
				// logger
				this.logger.info("动态监测初始化完毕！");
				// 初始化完成
				return;
			}
			// logger
			this.logger.info("正在获取动态信息...");
			// 使用withRetry函数进行重试
			const content = await withRetry(async () => {
				// 获取动态内容
				return (await this.ctx.ba.getAllDynamic()) as AllDynamicInfo;
			}, 1).catch((e) => {
				// logger
				this.logger.error(
					`dynamicDetect getAllDynamic() 发生了错误，错误为：${e.message}`,
				);
			});
			// content不存在则直接返回
			if (!content) {
				// logger
				this.logger.info("获取动态信息失败！");
				return;
			}
			// 判断获取动态内容是否成功
			if (content.code !== 0) {
				switch (content.code) {
					case -101: {
						// 账号未登录
						// 输出日志
						this.logger.error(
							"账号未登录，插件已停止工作，请登录后，输入指令 sys start 启动插件",
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							"账号未登录，插件已停止工作，请登录后，输入指令 sys start 启动插件",
						);
						// 停止服务
						await this.ctx.sm.disposePlugin();
						// 结束循环
						break;
					}
					case -352: {
						// 风控
						// 输出日志
						this.logger.error(
							"账号被风控，插件已停止工作，请确认风控解除后，输入指令 sys start 启动插件",
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							"账号被风控，插件已停止工作，请确认风控解除后，输入指令 sys start 启动插件",
						);
						// 停止服务
						await this.ctx.sm.disposePlugin();
						// 结束循环
						break;
					}
					case 4101128:
					case 4101129: {
						// 获取动态信息错误
						// 输出日志
						this.logger.error(
							`获取动态信息错误，错误码为：${content.code}，错误为：${content.message}`,
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							`获取动态信息错误，错误码为：${content.code}，错误为：${content.message}`,
						); // 未知错误
						// 结束循环
						break;
					}
					default: {
						// 未知错误
						// 发送私聊消息
						await this.sendPrivateMsg(
							`获取动态信息错误，错误码为：${content.code}，错误为：${content.message}`,
						); // 未知错误
						// 结束循环
						break;
					}
				}
			}
			// logger
			this.logger.info("成功获取动态信息！开始检查更新的动态...");
			// 获取动态内容
			const items = content.data.items;
			// 检查更新的动态
			for (const item of items) {
				// 没有动态内容则直接跳过
				if (!item) {
					// logger
					this.logger.info("动态内容为空，跳过该动态");
					continue;
				}
				// 获取动态ID
				const dynamicId = item.id_str;
				// logger
				this.logger.info(`当前动态ID:${dynamicId}`);
				this.logger.info(`上一次获取到第一条动态ID:${dynamicId}`);
				// 动态ID如果一致则结束循环
				if (dynamicId === dynamicIdStr1st) {
					// logger
					this.logger.info("动态ID与上一次获取第一条一致，结束循环");
					break;
				}
				// logger
				this.logger.info(`当前动态时间线:${item.modules.module_author.pub_ts}`);
				this.logger.info(`上一次获取到第一条动态时间线:${timeline}`);
				// 判断动态时间戳是否大于时间线
				if (item.modules.module_author.pub_ts > timeline) {
					// logger
					this.logger.info("动态时间线大于上一次获取到第一条动态时间线，开始判断是否是订阅的UP主...");
					// 从动态数据中取出UP主名称、UID
					const upUID = item.modules.module_author.mid.toString();
					const upName = item.modules.module_author.name;
					// logger
					this.logger.info(`当前动态UP主UID:${upUID}，UP主名称:${upName}`);
					// 寻找关注的UP主的动态
					for (const sub of this.subManager) {
						// 判断是否是订阅的UP主
						if (sub.dynamic && sub.uid === upUID) {
							// logger：订阅该UP主，推送该动态
							this.logger.info("订阅该UP主，开始推送该动态...");
							// logger
							this.logger.info("开始生成推送卡片...");
							// 推送该条动态
							const buffer = await withRetry(async () => {
								// 渲染图片
								return await this.ctx.gi.generateDynamicImg(item, sub.card);
							}, 1).catch(async (e) => {
								// 直播开播动态，不做处理
								if (e.message === "直播开播动态，不做处理") return;
								if (e.message === "出现关键词，屏蔽该动态") {
									// 如果需要发送才发送
									if (this.config.filter.notify) {
										await this.sendMsg(
											sub.target,
											`${upName}发布了一条含有屏蔽关键字的动态`,
										);
									}
									return;
								}
								if (e.message === "已屏蔽转发动态") {
									if (this.config.filter.notify) {
										await this.sendMsg(
											sub.target,
											`${upName}转发了一条动态，已屏蔽`,
										);
									}
									return;
								}
								// 未知错误
								this.logger.error(
									`dynamicDetect generateDynamicImg() 推送卡片发送失败，原因：${e.message}`,
								);
								// 发送私聊消息并重启服务
								await this.sendPrivateMsgAndStopService();
							});
							// 判断是否执行成功，未执行成功直接返回
							if (!buffer) {
								// logger
								this.logger.info("推送卡片生成失败，或该动态为屏蔽动态，跳过该动态！");
								// 结束循环
								continue;
							}
							// 定义动态链接
							let dUrl = "";
							// 判断是否需要发送URL
							if (this.config.dynamicUrl) {
								// logger
								this.logger.info("生成动态链接中...");
								// 生成动态链接
								dUrl = `${upName}发布了一条动态：https://t.bilibili.com/${dynamicId}`;
							}
							// logger
							this.logger.info("推送动态中...");
							// 发送推送卡片
							await this.sendMsg(
								sub.target,
								<>
									{h.image(buffer, "image/png")}
									{dUrl}
								</>,
							);
							// logger
							this.logger.info("动态推送完毕！");
							// 判断是否需要发送动态中的图片
							if (this.config.pushImgsInDynamic) {
								// logger
								this.logger.info("开始推送动态中的图片...");
								// 判断是否为图文动态，且存在draw
								if (
									item.type === "DYNAMIC_TYPE_DRAW" &&
									item.modules.module_dynamic.major?.draw
								) {
									for (const img of item.modules.module_dynamic.major.draw
										.items) {
										await this.sendMsg(
											sub.target,
											<img src={img.src} alt="动态图片" />,
										);
									}
								}
								// logger
								this.logger.info("图片推送完毕！");
							}
							// logger
							this.logger.info("动态推送完毕！");
						}
					}
				}
			}
			// 更新本次请求第一条动态的动态ID
			dynamicIdStr1st = items[0].id_str;
			// logger
			this.logger.info(`更新本次请求第一条动态的动态ID:${dynamicIdStr1st}`);
			// 更新时间线
			timeline = items[0].modules.module_author.pub_ts || DateTime.now().toSeconds();
			// logger
			this.logger.info(`更新时间线:${timeline}`);
		};
		// 返回一个闭包函数
		return withLock(handler);
	}

	// 定义获取主播信息方法
	async useMasterInfo(
		uid: string,
		masterInfo: MasterInfo,
		liveType: LiveType,
	): Promise<MasterInfo> {
		// 获取主播信息
		const { data } = await this.ctx.ba.getMasterInfo(uid);
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
		};
	}

	async useLiveRoomInfo(roomId: string) {
		// 发送请求获取直播间信息
		const data = await withRetry(
			async () => await this.ctx.ba.getLiveRoomInfo(roomId),
		)
			.then((content) => content.data)
			.catch((e) => {
				this.logger.error(
					`liveDetect getLiveRoomInfo 发生了错误，错误为：${e.message}`,
				);
				// 返回错误
				return false;
			});
		// 发送私聊消息并重启服务
		if (!data) return await this.sendPrivateMsgAndStopService();
		// 返回
		return data;
	}

	async liveDetectWithListener(
		roomId: string,
		target: Target,
		cardStyle: SubItem["card"],
	) {
		// 定义开播时间
		let liveTime: string;
		// 定义定时推送定时器
		let pushAtTimeTimer: () => void;
		// 定义弹幕存放数组
		const currentLiveDanmakuArr: Array<string> = [];
		// 定义开播状态
		let liveStatus = false;
		// 处理target
		// 定义channelIdArr总长度
		let channelIdArrLen = 0;
		// 定义数据
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		let liveRoomInfo: any;
		let masterInfo: MasterInfo;
		let watchedNum: string;
		// 定义发送直播通知卡片方法
		const sendLiveNotifyCard = async (
			liveType: LiveType,
			followerDisplay: string,
			liveNotifyMsg?: string,
		) => {
			// 生成图片
			const buffer = await withRetry(async () => {
				// 获取直播通知卡片
				return await this.ctx.gi.generateLiveImg(
					liveRoomInfo,
					masterInfo.username,
					masterInfo.userface,
					followerDisplay,
					liveType,
					cardStyle,
				);
			}, 1).catch((e) => {
				this.logger.error(
					`liveDetect generateLiveImg() 推送卡片生成失败，原因：${e.message}`,
				);
			});
			// 发送私聊消息并重启服务
			if (!buffer) return await this.sendPrivateMsgAndStopService();
			// 推送直播信息
			const msg = (
				<>
					{h.image(buffer, "image/png")}
					{liveNotifyMsg || ""}
				</>
			);
			// 只有在开播时才艾特全体成员
			return await this.sendMsg(
				target,
				msg,
				liveType === LiveType.StartBroadcasting,
			);
		};
		// 找到频道/群组对应的
		const liveGuardBuyPushTargetArr: Target = target.map((channel) => {
			// 获取符合条件的target
			const liveGuardBuyArr = channel.channelIdArr.filter(
				(channelId) => channelId.liveGuardBuy,
			);
			// 将当前liveDanmakuArr的长度+到channelIdArrLen中
			channelIdArrLen += liveGuardBuyArr.length;
			// 返回符合的target
			return {
				channelIdArr: liveGuardBuyArr,
				platform: channel.platform,
			};
		});
		// 定义定时推送函数
		const pushAtTimeFunc = async () => {
			// 判断是否信息是否获取成功
			if (!(await useMasterAndLiveRoomInfo(LiveType.LiveBroadcast))) {
				// 未获取成功，直接返回
				return this.sendPrivateMsg("获取直播间信息失败，推送直播卡片失败！");
			}
			// 设置开播时间
			liveTime = liveRoomInfo.live_time;
			// 获取watched
			const watched = watchedNum || "暂未获取到";
			// 设置直播中消息
			const liveMsg = this.config.customLive
				? this.config.customLive
						.replace("-name", masterInfo.username)
						.replace("-time", await this.ctx.gi.getTimeDifference(liveTime))
						.replace("-watched", watched)
						.replace("\\n", "\n")
						.replace(
							"-link",
							`https://live.bilibili.com/${liveRoomInfo.short_id === 0 ? liveRoomInfo.room_id : liveRoomInfo.short_id}`,
						)
				: null;
			// 发送直播通知卡片
			await sendLiveNotifyCard(LiveType.LiveBroadcast, watched, liveMsg);
		};
		// 定义直播间信息获取函数
		const useMasterAndLiveRoomInfo = async (liveType: LiveType) => {
			// 定义函数是否执行成功flag
			let flag = true;
			// 获取直播间信息
			liveRoomInfo = await this.useLiveRoomInfo(roomId).catch(() => {
				// 设置flag为false
				flag = false;
				// 返回空
				return null;
			});
			// 判断是否成功获取信息
			if (!flag || !liveRoomInfo || !liveRoomInfo.uid) {
				// 上一步未成功
				flag = false;
				// 返回flag
				return flag;
			}
			// 获取主播信息(需要满足flag为true，liveRoomInfo.uid有值)
			masterInfo = await this.useMasterInfo(
				liveRoomInfo.uid,
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
		// 构建消息处理函数
		const handler: MsgHandler = {
			onIncomeDanmu: ({ body }) => {
				// 保存消息到数组
				currentLiveDanmakuArr.push(body.content);
			},
			onIncomeSuperChat: ({ body }) => {
				// 保存消息到数组
				currentLiveDanmakuArr.push(body.content);
			},
			onWatchedChange: ({ body }) => {
				// 保存观看人数到变量
				watchedNum = body.text_small;
			},
			onGuardBuy: ({ body }) => {
				// 定义消息
				const content = `[${masterInfo.username}的直播间]「${body.user.uname}」加入了大航海（${body.gift_name}）`;
				// 直接发送消息
				channelIdArrLen > 0 && this.sendMsg(liveGuardBuyPushTargetArr, content);
			},
			onLiveStart: async () => {
				// 判断是否已经开播
				if (liveStatus) return;
				// 设置开播状态为true
				liveStatus = true;
				// 判断是否信息是否获取成功
				if (!(await useMasterAndLiveRoomInfo(LiveType.StartBroadcasting))) {
					// 设置开播状态为false
					liveStatus = false;
					// 未获取成功，直接返回
					return await this.sendPrivateMsg(
						"获取直播间信息失败，推送直播开播卡片失败！",
					);
				}
				// 设置开播时间
				liveTime = liveRoomInfo.live_time;
				// 获取当前粉丝数
				const follower =
					masterInfo.liveOpenFollowerNum >= 10_000
						? `${(masterInfo.liveOpenFollowerNum / 10000).toFixed(1)}万`
						: masterInfo.liveOpenFollowerNum.toString();
				// 定义开播通知语
				const liveStartMsg = this.config.customLiveStart
					? this.config.customLiveStart
							.replace("-name", masterInfo.username)
							.replace("-time", await this.ctx.gi.getTimeDifference(liveTime))
							.replace("-follower", follower)
							.replace("\\n", "\n")
							.replace(
								"-link",
								`https://live.bilibili.com/${liveRoomInfo.short_id === 0 ? liveRoomInfo.room_id : liveRoomInfo.short_id}`,
							)
					: null;
				// 推送开播通知
				await sendLiveNotifyCard(
					LiveType.StartBroadcasting,
					follower,
					liveStartMsg,
				);
				// 判断定时器是否已开启
				if (!pushAtTimeTimer) {
					// 开始直播，开启定时器
					pushAtTimeTimer = this.ctx.setInterval(
						pushAtTimeFunc,
						this.config.pushTime * 1000 * 60 * 60,
					);
				}
			},
			onLiveEnd: async () => {
				// 将直播状态设置为false
				liveStatus = false;
				// 判断是否信息是否获取成功
				if (!(await useMasterAndLiveRoomInfo(LiveType.StopBroadcast))) {
					// 未获取成功，直接返回
					return this.sendPrivateMsg(
						"获取直播间信息失败，推送直播下播卡片失败！",
					);
				}
				// 更改直播时长
				liveRoomInfo.live_time = liveTime;
				// 获取粉丝数变化
				const followerChange = (() => {
					// 获取直播关注变化值
					const liveFollowerChangeNum = masterInfo.liveFollowerChange;
					// 判断是否大于0
					if (liveFollowerChangeNum > 0) {
						// 大于0则加+
						return liveFollowerChangeNum >= 10_000
							? `+${liveFollowerChangeNum.toFixed(1)}万`
							: `+${liveFollowerChangeNum}`;
					}
					// 小于0
					return liveFollowerChangeNum <= -10_000
						? `${liveFollowerChangeNum.toFixed(1)}万`
						: liveFollowerChangeNum.toString();
				})();
				// 定义下播播通知语
				const liveEndMsg = this.config.customLiveEnd
					? this.config.customLiveEnd
							.replace("-name", masterInfo.username)
							.replace("-time", await this.ctx.gi.getTimeDifference(liveTime))
							.replace("-follower_change", followerChange)
							.replace("\\n", "\n")
					: null;
				// 推送通知卡片
				await sendLiveNotifyCard(
					LiveType.StopBroadcast,
					followerChange,
					liveEndMsg,
				);
				// 关闭定时推送定时器
				pushAtTimeTimer();
				// 将推送定时器变量置空
				pushAtTimeTimer = null;
			},
		};
		// 启动直播间弹幕监测
		await this.ctx.bl.startLiveRoomListener(roomId, handler);
		// 第一次启动获取信息并判信息是否获取成功
		if (!(await useMasterAndLiveRoomInfo(LiveType.FirstLiveBroadcast))) {
			// 未获取成功，直接返回
			return this.sendPrivateMsg(
				"获取直播间信息失败，启动直播间弹幕检测失败！",
			);
		}
		// 判断直播状态
		if (liveRoomInfo.live_status === 1) {
			// 设置开播时间
			liveTime = liveRoomInfo.live_time;
			// 获取当前累计观看人数
			const watched = watchedNum || "暂未获取到";
			// 定义直播中通知消息
			const liveMsg = this.config.customLive
				? this.config.customLive
						.replace("-name", masterInfo.username)
						.replace("-time", await this.ctx.gi.getTimeDifference(liveTime))
						.replace("-watched", watched)
						.replace("\\n", "\n")
						.replace(
							"-link",
							`https://live.bilibili.com/${liveRoomInfo.short_id === 0 ? liveRoomInfo.room_id : liveRoomInfo.short_id}`,
						)
				: null;
			// 发送直播通知卡片
			if (this.config.restartPush) {
				await sendLiveNotifyCard(LiveType.LiveBroadcast, watched, liveMsg);
			}
			// 正在直播，开启定时器，判断定时器是否已开启
			if (!pushAtTimeTimer) {
				// 开始直播，开启定时器
				pushAtTimeTimer = this.ctx.setInterval(
					pushAtTimeFunc,
					this.config.pushTime * 1000 * 60 * 60,
				);
			}
			// 设置直播状态为true
			liveStatus = true;
		}
	}

	subShow() {
		// 在控制台中显示订阅对象
		let table = "";
		for (const sub of this.subManager) {
			table += `UID:${sub.uid}  ${sub.dynamic ? "已订阅动态" : ""}  ${sub.live ? "已订阅直播" : ""}\n`;
		}
		return table ? table : "没有订阅任何UP";
	}

	updateSubNotifier() {
		// 更新控制台提示
		if (this.subNotifier) this.subNotifier.dispose();
		// 获取订阅信息
		const subInfo = this.subShow();
		// 定义table
		let table = "";
		if (subInfo === "没有订阅任何UP") {
			table = subInfo;
		} else {
			// 获取subTable
			const subTableArray = subInfo.split("\n");
			subTableArray.splice(subTableArray.length - 1, 1);
			// 定义Table
			table = (
				<>
					<p>当前订阅对象：</p>
					<ul>
						{subTableArray.map((str) => (
							// biome-ignore lint/correctness/useJsxKeyInIterable: <explanation>
							<li>{str}</li>
						))}
					</ul>
				</>
			);
		}
		// 设置更新后的提示
		this.subNotifier = this.ctx.notifier.create(table);
	}

	async checkIfLoginInfoIsLoaded() {
		return new Promise((resolve) => {
			const check = () => {
				if (!this.ctx.ba.getLoginInfoIsLoaded()) {
					this.ctx.setTimeout(check, 500);
				} else {
					resolve("success");
				}
			};
			check();
		});
	}

	async subUserInBili(mid: string): Promise<{
		code: number;
		msg: string;
	}> {
		// 获取关注分组信息
		const checkGroupIsReady = async (): Promise<{
			code: number;
			msg: string;
		}> => {
			// 判断是否有数据
			if (
				this.loginDBData.dynamic_group_id === "" ||
				this.loginDBData.dynamic_group_id === null
			) {
				// 没有数据，没有创建分组，尝试创建分组
				const createGroupData = await this.ctx.ba.createGroup("订阅");
				// 如果分组已创建，则获取分组id
				if (createGroupData.code === 22106) {
					// 分组已存在，拿到之前的分组id
					const allGroupData = await this.ctx.ba.getAllGroup();
					// 遍历所有分组
					for (const group of allGroupData.data) {
						// 找到订阅分组
						if (group.name === "订阅") {
							// 拿到分组id
							this.loginDBData.dynamic_group_id = group.tagid;
							// 结束循环
							break;
						}
					}
				} else if (createGroupData.code !== 0) {
					// 创建分组失败
					return { code: createGroupData.code, msg: createGroupData.message };
				}
				// 创建成功，保存到数据库
				this.ctx.database.set("loginBili", 1, {
					dynamic_group_id: this.loginDBData.dynamic_group_id,
				});
				// 创建成功
				return { code: createGroupData.code, msg: createGroupData.message };
			}
			return { code: 0, msg: "分组已存在" };
		};
		// 判断分组是否准备好
		const resp = await checkGroupIsReady();
		// 判断是否创建成功
		if (resp.code !== 0) {
			// 创建分组失败
			return resp;
		}
		// 获取分组详情
		const getGroupDetailData = async (): Promise<{
			code: number;
			msg: string;
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			data: any;
		}> => {
			// 获取分组明细
			const relationGroupDetailData = await this.ctx.ba.getRelationGroupDetail(
				this.loginDBData.dynamic_group_id,
			);
			// 判断分组信息是否获取成功
			if (relationGroupDetailData.code !== 0) {
				if (relationGroupDetailData.code === 22104) {
					// 将原先的分组id置空
					this.loginDBData.dynamic_group_id = null;
					// 分组不存在
					const resp = await checkGroupIsReady();
					// 判断是否创建成功
					if (resp.code !== 0) {
						// 创建分组失败
						return { ...resp, data: undefined };
					}
					// 再次获取分组明细
					return getGroupDetailData();
				}
				// 获取分组明细失败
				return {
					code: relationGroupDetailData.code,
					msg: relationGroupDetailData.message,
					data: undefined,
				};
			}
			return {
				code: 0,
				msg: "获取分组明细成功",
				data: relationGroupDetailData.data,
			};
		};
		// 获取分组明细
		const { code, msg, data } = await getGroupDetailData();
		// 判断获取分组明细是否成功
		if (code !== 0) {
			return { code, msg };
		}
		// 判断是否已经订阅该对象
		for (const user of data) {
			if (user.mid === mid) {
				// 已关注订阅对象
				return { code: 0, msg: "订阅对象已存在于分组中" };
			}
		}
		// 订阅对象
		const subUserData = (await this.ctx.ba.follow(mid)) as {
			code: number;
			message: string;
		};
		// 模式匹配
		const subUserMatchPattern = {
			[-101]: () => {
				return {
					code: subUserData.code,
					msg: "账号未登录，请使用指令bili login登录后再进行订阅操作",
				};
			},
			[-102]: () => {
				return {
					code: subUserData.code,
					msg: "账号被封停，无法进行订阅操作",
				};
			},
			[22002]: () => {
				return {
					code: subUserData.code,
					msg: "因对方隐私设置，无法进行订阅操作",
				};
			},
			[22003]: () => {
				return {
					code: subUserData.code,
					msg: "你已将对方拉黑，无法进行订阅操作",
				};
			},
			[22013]: () => {
				return {
					code: subUserData.code,
					msg: "账号已注销，无法进行订阅操作",
				};
			},
			[40061]: () => {
				return {
					code: subUserData.code,
					msg: "账号不存在，请检查uid输入是否正确或用户是否存在",
				};
			},
			[22001]: () => {
				return {
					code: 0,
					msg: "订阅对象为自己，无需添加到分组",
				};
			},
			// 已订阅该对象
			[22014]: async () => {
				// 把订阅对象添加到分组中
				const copyUserToGroupData = await this.ctx.ba.copyUserToGroup(
					mid,
					this.loginDBData.dynamic_group_id,
				);
				// 判断是否添加成功
				if (copyUserToGroupData.code !== 0) {
					// 添加失败
					return {
						code: copyUserToGroupData.code,
						msg: "添加订阅对象到分组失败，请稍后重试",
					};
				}
				// 添加成功
				return { code: 0, msg: "订阅对象添加成功" };
			},
			// 订阅成功
			[0]: async () => {
				// 把订阅对象添加到分组中
				const copyUserToGroupData = await this.ctx.ba.copyUserToGroup(
					mid,
					this.loginDBData.dynamic_group_id,
				);
				// 判断是否添加成功
				if (copyUserToGroupData.code !== 0) {
					// 添加失败
					return {
						code: copyUserToGroupData.code,
						msg: "添加订阅对象到分组失败，请稍后重试",
					};
				}
				// 添加成功
				return { code: 0, msg: "订阅对象添加成功" };
			},
		};
		// 获取函数
		const func: () => Promise<{ code: number; msg: string }> =
			subUserMatchPattern[subUserData.code];
		// 执行函数并返回
		return await func();
	}

	async loadSubFromConfig(subs: ComRegister.Config["sub"]) {
		// 定义一个AbortController
		const controller = new AbortController();
		const { signal } = controller;

		// 设置超时
		signal.addEventListener("abort", () => {
			this.logger.info(`${signal.reason}，订阅未完全加载！`);
		});

		await Promise.all(
			subs.map(async (sub) => {
				let timer: () => void;
				// 创建一个定时器
				const timeoutPromise = new Promise((_, reject) => {
					timer = this.ctx.setTimeout(() => {
						// 取消订阅加载
						if (signal.aborted) return;
						// 终止
						controller.abort(`加载订阅UID:${sub.uid}超时`);
					}, this.config.subLoadTimeout * 1000);
				});

				await Promise.race([
					(async () => {
						// logger
						this.logger.info(`加载订阅UID:${sub.uid}中...`);
						// 定义Data
						const data = await withRetry(
							async () => await this.ctx.ba.getUserInfo(sub.uid),
						)
							.then((content) => content.data)
							.catch((e) => {
								this.logger.error(
									`loadSubFromConfig() getUserInfo() 发生了错误，错误为：${e.message}`,
								);
								// logger
								this.logger.info(`加载订阅UID:${sub.uid}失败！`);
							});
						// 判断是否需要订阅直播
						if (sub.live) {
							// 检查roomid是否存在
							if (!data.live_room) {
								// 用户没有开通直播间，无法订阅直播
								sub.live = false;
								// 发送提示
								this.logger.warn(
									`UID:${sub.uid} 用户没有开通直播间，无法订阅直播！`,
								);
							}
							// 判断是否订阅直播
							if (sub.live) {
								// 启动直播监测
								await this.liveDetectWithListener(
									data.live_room.roomid,
									sub.target,
									sub.card,
								);
							}
						}
						// 在B站中订阅该对象
						const subInfo = await this.subUserInBili(sub.uid);
						// 判断订阅是否成功
						if (subInfo.code !== 0) {
							// 订阅失败，直接返回
							this.logger.error(
								`UID:${sub.uid} 订阅失败，错误信息：${subInfo.msg}`,
							);
							return;
						}
						// 判断是否超时
						if (signal.aborted) {
							// 订阅加载超时，取消订阅加载
							return;
						}
						// 清除定时器
						timer();
						// 将该订阅添加到sm中
						this.subManager.push({
							id: +sub.uid,
							uid: sub.uid,
							uname: data.name,
							roomId: sub.live ? data.live_room.roomid : "",
							target: sub.target,
							platform: "",
							live: sub.live,
							dynamic: sub.dynamic,
							card: sub.card,
						});
						// logger
						this.logger.info(`UID:${sub.uid}订阅加载完毕！`);
					})(),
					timeoutPromise,
				]);
			}),
		);
	}

	checkIfDynamicDetectIsNeeded() {
		// 检查是否有订阅对象需要动态监测
		if (this.subManager.some((sub) => sub.dynamic)) this.enableDynamicDetect();
	}

	enableDynamicDetect() {
		// 开始动态监测
		this.dynamicDispose = this.ctx.cron(
			"*/2 * * * *",
			this.config.dynamicDebugMode
				? this.debug_dynamicDetect()
				: this.dynamicDetect(),
		);
	}

	async checkIfIsLogin() {
		if ((await this.ctx.database.get("loginBili", 1)).length !== 0) {
			// 数据库中有数据
			// 检查cookie中是否有值
			if (this.ctx.ba.getCookies() !== "[]") {
				// 有值说明已登录
				return true;
			}
		}
		return false;
	}
}

namespace ComRegister {
	export interface Config {
		subLoadTimeout: number;
		sub: Array<{
			uid: string;
			dynamic: boolean;
			live: boolean;
			target: Array<{
				channelIdArr: Array<{
					channelId: string;
					dynamic: boolean;
					live: boolean;
					liveGuardBuy: boolean;
					atAll: boolean;
				}>;
				platform: string;
			}>;
			card: {
				enable: boolean;
				cardColorStart: string;
				cardColorEnd: string;
				cardBasePlateColor: string;
				cardBasePlateBorder: string;
			};
		}>;
		master: {
			enable: boolean;
			platform: string;
			masterAccount: string;
			masterAccountGuildId: string;
		};
		automaticResend: boolean;
		liveDetectMode: "API" | "WS";
		restartPush: boolean;
		pushTime: number;
		pushImgsInDynamic: boolean;
		liveLoopTime: number;
		customLiveStart: string;
		customLive: string;
		customLiveEnd: string;
		dynamicUrl: boolean;
		filter: {
			enable: boolean;
			notify: boolean;
			regex: string;
			keywords: Array<string>;
		};
		dynamicDebugMode: boolean;
	}

	export const Config: Schema<Config> = Schema.object({
		subLoadTimeout: Schema.number(),
		sub: Schema.array(
			Schema.object({
				uid: Schema.string().description("订阅用户UID"),
				dynamic: Schema.boolean().description("是否订阅用户动态"),
				live: Schema.boolean().description("是否订阅用户直播"),
				target: Schema.array(
					Schema.object({
						channelIdArr: Schema.array(
							Schema.object({
								channelId: Schema.string().description("频道/群组号"),
								dynamic: Schema.boolean().description(
									"该频道/群组是否推送动态信息",
								),
								live: Schema.boolean().description(
									"该频道/群组是否推送直播通知",
								),
								liveGuardBuy: Schema.boolean().description(
									"该频道/群组是否推送弹幕消息",
								),
								atAll: Schema.boolean().description(
									"推送开播通知时是否艾特全体成员",
								),
							}),
						).description("频道/群组信息"),
						platform: Schema.string().description("推送平台"),
					}),
				).description("订阅用户需要发送的频道/群组信息"),
				card: Schema.object({
					enable: Schema.boolean(),
					cardColorStart: Schema.string(),
					cardColorEnd: Schema.string(),
					cardBasePlateColor: Schema.string(),
					cardBasePlateBorder: Schema.string(),
				}).description(
					"自定义推送卡片颜色，默认使用插件内置的颜色，设置后会覆盖插件内置的颜色",
				),
			}),
		)
			.role("table")
			.description(
				"手动输入订阅信息，方便自定义订阅内容，这里的订阅内容不会存入数据库。uid: 订阅用户UID，dynamic: 是否需要订阅动态，live: 是否需要订阅直播",
			),
		master: Schema.object({
			enable: Schema.boolean(),
			platform: Schema.string(),
			masterAccount: Schema.string(),
			masterAccountGuildId: Schema.string(),
		}),
		automaticResend: Schema.boolean().required(),
		liveDetectMode: Schema.union([
			Schema.const("API"),
			Schema.const("WS"),
		]).required(),
		restartPush: Schema.boolean().required(),
		pushTime: Schema.number().required(),
		pushImgsInDynamic: Schema.boolean().required(),
		liveLoopTime: Schema.number().default(10),
		customLiveStart: Schema.string().required(),
		customLive: Schema.string(),
		customLiveEnd: Schema.string().required(),
		dynamicUrl: Schema.boolean().required(),
		filter: Schema.object({
			enable: Schema.boolean(),
			notify: Schema.boolean(),
			regex: Schema.string(),
			keywords: Schema.array(String),
		}),
		dynamicDebugMode: Schema.boolean().required(),
	});
}

export default ComRegister;
