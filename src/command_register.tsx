// Koishi核心依赖
// biome-ignore assist/source/organizeImports: <import>
import {
	type Bot,
	type Context,
	type FlatPick,
	type Logger,
	Schema,
	h,
	Universal,
} from "koishi";
import type { Notifier } from "@koishijs/plugin-notifier";
// biome-ignore lint/correctness/noUnusedImports: <import type>
import {} from "@koishijs/plugin-help";
import type { LoginBili } from "./database";
// 外部依赖
import type { MsgHandler } from "@akokko/blive-message-listener";
import QRCode from "qrcode";
import { CronJob } from "cron";
// Utils
import { withLock, withRetry } from "./utils";
// Types
import {
	type AllDynamicInfo,
	type CreateGroup,
	type GroupList,
	type Live,
	type LiveMsg,
	type LiveStatus,
	LiveType,
	type LiveUsers,
	type MasterInfo,
	type MasterInfoR,
	type PushArrMap,
	PushType,
	PushTypeMsg,
	type Result,
	type SubItem,
	type SubManager,
} from "./type";
import { DateTime } from "luxon";
import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict";
import { stopwords } from "./stop_words";

class ComRegister {
	// 必须服务
	static inject = ["ba", "gi", "database", "bl", "sm"];
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
	// 动态时间线管理器
	dynamicTimelineManager: Map<string, number> = new Map();
	// 直播状态管理器
	liveStatusManager: Map<string, LiveStatus> = new Map();
	// 直播推送消息管理器
	liveMsgManager: Map<string, LiveMsg> = new Map();
	// PushArrMap
	pushArrMap: PushArrMap = new Map();
	// 检查登录数据库是否有数据
	loginDBData: FlatPick<LoginBili, "dynamic_group_id">;
	// 机器人实例
	privateBot: Bot<Context>;
	// 动态检测销毁函数
	dynamicJob: CronJob;
	// 直播检测销毁函数
	liveJob: CronJob;
	// 创建segmentit
	_jieba = Jieba.withDict(dict);
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
				if (this.dynamicJob?.isActive) {
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
				// biome-ignore lint/suspicious/noExplicitAny: <any>
				let content: any;
				try {
					content = await ctx.ba.getLoginQRCode();
				} catch (_) {
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
						await session.send(h.image(buffer, "image/jpeg"));
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
						// biome-ignore lint/suspicious/noExplicitAny: <any>
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
							// 检查登录数据库是否有数据
							this.loginDBData = (
								await this.ctx.database.get("loginBili", 1)
							)[0];
							// ba重新加载登录信息
							await this.ctx.ba.loadCookiesFromDatabase();
							// 判断登录信息是否已加载完毕
							await this.checkIfLoginInfoIsLoaded();
							// 销毁定时器
							this.loginTimer();
							// 订阅手动订阅中的订阅
							const { code, msg } = await this.loadSubFromConfig(config.sub);
							// 判断是否加载成功
							if (code !== 0) this.logger.error(msg);
							// 清除控制台通知
							ctx.ba.disposeNotifier();
							// 发送成功登录推送
							await session.send("登录成功");
							// bili show
							await session.execute("bili list");
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

		biliCom
			.subcommand(".dyn <uid:string> [index:number]", "手动推送一条动态信息", {
				hidden: true,
			})
			.usage("手动推送一条动态信息")
			.example("bili dyn 233 1 手动推送UID为233用户空间的第一条动态信息")
			.action(async ({ session }, uid, index) => {
				// 获取index
				const i = (index && index - 1) || 0;
				// 获取动态
				const content = await this.ctx.ba.getUserSpaceDynamic(uid);
				// 获取动态内容
				const item = content.data.items[i];
				// 生成图片
				const buffer = await withRetry(async () => {
					// 渲染图片
					return await this.ctx.gi.generateDynamicImg(item);
				}, 1).catch(async (e) => {
					// 直播开播动态，不做处理
					if (e.message === "直播开播动态，不做处理") {
						await session.send("直播开播动态，不做处理");
						return;
					}
					if (e.message === "出现关键词，屏蔽该动态") {
						await session.send("已屏蔽该动态");
						return;
					}
					if (e.message === "已屏蔽转发动态") {
						await session.send("已屏蔽转发动态");
						return;
					}
					if (e.message === "已屏蔽专栏动态") {
						await session.send("已屏蔽专栏动态");
						return;
					}
					// 未知错误
					this.logger.error(
						`dynamicDetect generateDynamicImg() 推送卡片发送失败，原因：${e.message}`,
					);
				});
				// 发送图片
				buffer && (await session.send(h.image(buffer, "image/jpeg")));
			});

		biliCom.subcommand(".wc").action(async ({ session }) => {
			const words: Array<[string, number]> = [
				["摆烂", 91],
				["可以", 82],
				["可以", 72],
				["可以", 42],
				["dog", 40],
				["dog", 40],
				["不是", 37],
				["不是", 37],
				["就是", 27],
				["就是", 27],
				["吃瓜", 16],
				["吃瓜", 16],
				["吃瓜", 16],
				["cj", 8],
				["cj", 8],
				["cj", 8],
				["没有", 8],
				["没有", 8],
				["没有", 8],
				["有点", 8],
				["有点", 8],
				["喜欢", 7],
				["喜欢", 7],
				["空调", 7],
				["空调", 7],
				["空调", 7],
				["感觉", 7],
				["感觉", 7],
				["感觉", 7],
				["时候", 6],
				["时候", 6],
				["怎么", 6],
				["怎么", 6],
				["痛车", 6],
				["痛车", 6],
				["一下", 6],
				["一下", 6],
				["还是", 6],
				["还是", 6],
				["麻麻", 6],
				["麻麻", 6],
				["下午", 5],
				["下午", 5],
				["开始", 5],
				["开始", 5],
				["一部", 5],
				["一部", 5],
				["这样", 5],
				["这样", 5],
				["上次", 5],
				["上次", 5],
				["游戏", 5],
				["游戏", 5],
				["这边", 5],
				["这边", 5],
				["问号", 5],
				["问号", 5],
				["好看", 5],
				["好看", 5],
				["哈哈哈", 5],
				["哈哈哈", 5],
				["角色", 5],
				["角色", 5],
				["味道", 5],
				["味道", 5],
				["233333", 4],
				["233333", 4],
				["老规矩", 4],
				["老规矩", 4],
				["鸣潮", 4],
				["鸣潮", 4],
				["养生", 4],
				["养生", 4],
				["划掉", 4],
				["划掉", 4],
				["排队", 4],
				["排队", 4],
				["cos", 4],
				["cos", 4],
				["的话", 4],
				["的话", 4],
				["我们", 4],
				["主要", 4],
				["www", 4],
				["直接", 4],
				["不好", 4],
				["学校", 4],
				["一样", 4],
				["初中", 4],
				["毕业", 4],
			];

			await session.send(
				<message>
					{h.image(
						await this.ctx.gi.generateWordCloudImg(words, "词云测试"),
						"image/jpg",
					)}
				</message>,
			);

			const top5DanmakuMaker = [
				["张三", 60],
				["李四", 48],
				["王五", 45],
				["赵六", 27],
				["田七", 25],
			];

			const danmakerRankMsg = this.config.liveSummary
				.replace("-dmc", "114")
				.replace("-mdn", "特工")
				.replace("-dca", "514")
				.replace("-un1", `${top5DanmakuMaker[0][0]}`)
				.replace("-dc1", `${top5DanmakuMaker[0][1]}`)
				.replace("-un2", `${top5DanmakuMaker[1][0]}`)
				.replace("-dc2", `${top5DanmakuMaker[1][1]}`)
				.replace("-un3", `${top5DanmakuMaker[2][0]}`)
				.replace("-dc3", `${top5DanmakuMaker[2][1]}`)
				.replace("-un4", `${top5DanmakuMaker[3][0]}`)
				.replace("-dc4", `${top5DanmakuMaker[3][1]}`)
				.replace("-un5", `${top5DanmakuMaker[4][0]}`)
				.replace("-dc5", `${top5DanmakuMaker[4][1]}`)
				.replaceAll("\\n", "\n");

			await session.send(danmakerRankMsg);
		});

		biliCom.subcommand(".cap").action(async ({ session }) => {
			const { code: userInfoCode, data: userInfoData } = await withRetry(
				async () => {
					// 获取用户信息
					const data = await this.ctx.ba.getUserInfo("114514");
					// 返回用户信息
					return { code: 0, data };
				},
			).then((content) => content.data);
			// 判断是否满足风控条件
			if (userInfoCode !== -352 || !userInfoData.v_voucher)
				return "不满足验证条件，不需要执行该命令，如果提示风控可以尝试重启插件";
			// 开始进行风控验证
			const { data } = await ctx.ba.v_voucherCaptcha(userInfoData.v_voucher);
			// 判断是否能进行风控验证
			if (!data.geetest) {
				return "当前风控无法通过该验证解除，或许考虑人工申诉？";
			}
			// 发送提示消息消息
			await session.send(
				"请到该网站进行验证操作：https://kuresaru.github.io/geetest-validator/",
			);
			await session.send(
				"请手动填入 gt 和 challenge 后点击生成进行验证，验证完成后点击结果，根据提示输入对应validate",
			);
			// gt 和 challenge
			await session.send(`gt:${data.geetest.gt}`);
			await session.send(`challenge:${data.geetest.challenge}`);
			// 发送等待输入消息 validate
			await session.send("请输入validate");
			const validate = await session.prompt();
			// seccode
			const seccode = `${validate}|jordan`;
			// 验证结果
			const { data: validateCaptchaData } = await ctx.ba.validateCaptcha(
				data.geetest.challenge,
				data.token,
				validate,
				seccode,
			);
			// 判断验证是否成功
			if (validateCaptchaData.is_valid !== 1) return "验证不成功！";
			// 添加cookie
			ctx.ba.addCookie(`x-bili-gaia-vtoken=${validateCaptchaData.grisk_id}`);
			// 将cookies保存到数据库
			const encryptedCookies = ctx.ba.encrypt(ctx.ba.getCookies());
			await ctx.database.upsert("loginBili", [
				{
					id: 1,
					bili_cookies: encryptedCookies,
				},
			]);
			// 验证结束
			return "验证成功！请重启插件";
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
		if (config.sub) {
			const { code, msg } = await this.loadSubFromConfig(config.sub);
			// 判断是否加载成功
			if (code !== 0) {
				this.logger.error(msg);

				this.logger.error("订阅对象加载失败，插件初始化失败！");
				// 发送私聊消息
				await this.sendPrivateMsg("订阅对象加载失败，插件初始化失败！");

				return;
			}
		}
		// 初始化管理器
		this.initManager();
		// 检查是否需要动态监测
		this.checkIfDynamicDetectIsNeeded();
		// 检查是否需要直播监测(仅API模式)
		this.checkIfLiveDetectIsNeeded();
		// 在控制台中显示订阅对象
		this.updateSubNotifier();
		// 注册插件销毁函数
		this.ctx.on("dispose", () => {
			// 销毁登录定时器
			if (this.loginTimer) this.loginTimer();
			// 销毁动态监测
			if (this.dynamicJob) this.dynamicJob.stop();
			// 销毁直播监测
			if (this.liveJob) this.liveJob.stop();
		});
		// logger
		this.logger.info("插件初始化完毕！");
	}

	initManager() {
		for (const sub of this.subManager) {
			// 判断是否订阅动态
			if (sub.dynamic) {
				this.dynamicTimelineManager.set(
					sub.uid,
					Math.floor(DateTime.now().toSeconds()),
				);
			}
			// 判断是否订阅直播
			if (sub.live) {
				// 设置到直播状态管理对象
				this.liveStatusManager.set(sub.uid, {
					roomId: sub.roomId,
					live: false,
					liveRoomInfo: undefined,
					masterInfo: undefined,
					watchedNum: "0",
					liveStartTime: "",
					liveStartTimeInit: false,
					push: 0,
				});
			}
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
					`发送群组ID:${channelId}消息失败！原因: ${e.message}`,
				);
				await this.sendPrivateMsg(
					`发送群组ID:${channelId}消息失败，请查看日志`,
				);
			},
		);
	}

	preInitConfig(subs: ComRegister.Config["sub"]) {
		// 遍历subs
		for (const sub of subs) {
			// liveMsg Part

			// 构建直播推送消息对象
			const liveMsg: LiveMsg = {
				customLiveStart: this.config.customLiveStart || "",
				customLive: this.config.customLive || "",
				customLiveEnd: this.config.customLiveEnd || "",
			};
			// 判断是否个性化推送消息
			if (sub.liveMsg.enable) {
				liveMsg.customLiveStart =
					sub.liveMsg.customLiveStart || this.config.customLiveStart;
				liveMsg.customLive = sub.liveMsg.customLive || this.config.customLive;
				liveMsg.customLiveEnd =
					sub.liveMsg.customLiveEnd || this.config.customLiveEnd;
			}
			// 设置到直播推送消息管理对象
			this.liveMsgManager.set(sub.uid, liveMsg);

			// PushRecord part

			// 定义数组
			const atAllArr: Array<string> = [];
			const dynamicArr: Array<string> = [];
			const liveArr: Array<string> = [];
			const liveGuardBuyArr: Array<string> = [];
			// 遍历target
			for (const platform of sub.target) {
				// 遍历channelArr
				for (const channel of platform.channelArr) {
					if (channel.atAll) {
						atAllArr.push(`${platform.platform}:${channel.channelId}`);
					}
					if (channel.dynamic) {
						dynamicArr.push(`${platform.platform}:${channel.channelId}`);
					}
					if (channel.live) {
						liveArr.push(`${platform.platform}:${channel.channelId}`);
					}
					if (channel.liveGuardBuy) {
						liveGuardBuyArr.push(`${platform.platform}:${channel.channelId}`);
					}
				}
			}
			// 组装record
			this.pushArrMap.set(sub.uid, {
				atAllArr,
				dynamicArr,
				liveArr,
				liveGuardBuyArr,
			});
		}
		// logger
		this.logger.info("初始化推送群组/频道信息：");
		this.logger.info(this.pushArrMap);
	}

	checkAllBotsAreReady() {
		return !this.ctx.bots.some((bot) => bot.status !== Universal.Status.ONLINE);
	}

	async broadcastToTargets(
		uid: string,
		// biome-ignore lint/suspicious/noExplicitAny: <any>
		content: any,
		type: PushType,
		retry = 3000,
	) {
		// 检查所有bot是否准备好
		if (!this.checkAllBotsAreReady()) {
			// 有机器人未准备好，直接返回
			this.logger.error(
				`存在机器人未初始化完毕，无法进行推送，${retry / 1000}秒后重试`,
			);
			// 重试
			this.ctx.setTimeout(() => {
				this.broadcastToTargets(uid, content, type, retry * 2);
			}, retry);
			return;
		}
		// 发起推送
		this.logger.info(`本次推送对象：${uid}，推送类型：${PushTypeMsg[type]}`);
		// 拿到需要推送的record
		const record = this.pushArrMap.get(uid);
		// 推送record
		this.logger.info("本次推送目标：");
		// 判断是否需要艾特全体成员
		if (type === PushType.StartBroadcasting && record.atAllArr?.length >= 1) {
			this.logger.info(record.atAllArr);
			// 深拷贝
			const atAllArr = structuredClone(record.atAllArr);
			// 艾特全体
			const success = await withRetry(async () => {
				return await this.ctx.broadcast(
					atAllArr,
					<message>
						<at type="all" />
					</message>,
				);
			}, 1);
			// 发送成功群组
			this.logger.info(`成功推送全体成员消息：${success.length}条`);
		}
		// 推送动态
		if (type === PushType.Dynamic && record.dynamicArr?.length >= 1) {
			this.logger.info(record.dynamicArr);
			// 深拷贝
			const dynamicArr = structuredClone(record.dynamicArr);
			// 推送动态
			const success = await withRetry(async () => {
				return await this.ctx.broadcast(
					dynamicArr,
					<message>{content}</message>,
				);
			}, 1);
			// 发送成功群组
			this.logger.info(`成功推送动态消息：${success.length}条`);
		}
		// 推送直播
		if (
			(type === PushType.Live || type === PushType.StartBroadcasting) &&
			record.liveArr?.length >= 1
		) {
			this.logger.info(record.liveArr);
			// 深拷贝
			const liveArr = structuredClone(record.liveArr);
			// 推送直播
			const success = await withRetry(async () => {
				return await this.ctx.broadcast(liveArr, <message>{content}</message>);
			}, 1);
			// 发送成功群组
			this.logger.info(`成功推送直播消息：${success.length}条`);
		}
		// 推送直播守护购买
		if (type === PushType.LiveGuardBuy && record.liveGuardBuyArr?.length >= 1) {
			this.logger.info(record.liveGuardBuyArr);
			// 深拷贝
			const liveGuardBuyArr = structuredClone(record.liveGuardBuyArr);
			// 推送直播守护购买
			const success = await withRetry(async () => {
				return await this.ctx.broadcast(
					liveGuardBuyArr,
					<message>{content}</message>,
				);
			}, 1);
			// 发送成功群组
			this.logger.info(`成功推送上舰消息：${success.length}条`);
		}
		// 结束
		return;
	}

	dynamicDetect() {
		// 定义handler
		const handler = async () => {
			// 定义本次请求推送的动态
			const currentPushDyn: Record<
				string,
				AllDynamicInfo["data"]["items"][number]
			> = {};
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
				// 获取动态发布时间
				const postTime = item.modules.module_author.pub_ts;
				// 从动态数据中取出UP主名称、UID
				const uid = item.modules.module_author.mid.toString();
				const name = item.modules.module_author.name;
				// 判断是否存在时间线
				if (this.dynamicTimelineManager.has(uid)) {
					// 寻找关注的UP主
					const timeline = this.dynamicTimelineManager.get(uid);
					// 判断动态发布时间是否大于时间线
					if (timeline < postTime) {
						// 获取订阅对象
						const sub = this.subManager.find((sub) => sub.uid === uid);
						// 推送该条动态
						const buffer = await withRetry(async () => {
							// 渲染图片
							return await this.ctx.gi.generateDynamicImg(
								item,
								sub.card.enable ? sub.card : undefined,
							);
						}, 1).catch(async (e) => {
							// 直播开播动态，不做处理
							if (e.message === "直播开播动态，不做处理") return;
							if (e.message === "出现关键词，屏蔽该动态") {
								// 如果需要发送才发送
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										sub.uid,
										<message>{name}发布了一条含有屏蔽关键字的动态</message>,
										PushType.Dynamic,
									);
								}
								return;
							}
							if (e.message === "已屏蔽转发动态") {
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										sub.uid,
										<message>{name}转发了一条动态，已屏蔽</message>,
										PushType.Dynamic,
									);
								}
								return;
							}
							if (e.message === "已屏蔽专栏动态") {
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										sub.uid,
										<message>{name}投稿了一条专栏，已屏蔽</message>,
										PushType.Dynamic,
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
						// 定义动态链接
						let dUrl = "";
						// 判断是否需要发送URL
						if (this.config.dynamicUrl) {
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
						}
						// logger
						this.logger.info("推送动态中...");
						// 发送推送卡片
						await this.broadcastToTargets(
							sub.uid,
							<message>
								{h.image(buffer, "image/jpeg")}
								{dUrl}
							</message>,
							PushType.Dynamic,
						);
						// 判断是否需要发送动态中的图片
						if (this.config.pushImgsInDynamic) {
							// 判断是否为图文动态
							if (item.type === "DYNAMIC_TYPE_DRAW") {
								// 获取pics
								const pics = item.modules?.module_dynamic?.major?.opus?.pics;
								// 判断pics是否存在
								if (pics) {
									// 组合消息
									const picsMsg = (
										<message forward>
											{pics.map((pic) => (
												<img key={pic.url} src={pic.url} alt="动态图片" />
											))}
										</message>
									);
									// 发送消息
									await this.broadcastToTargets(
										sub.uid,
										picsMsg,
										PushType.Dynamic,
									);
								}
							}
						}
						// 如果当前订阅对象已存在更早推送，则无需再更新时间线
						if (!currentPushDyn[uid]) {
							// 将当前动态存入currentPushDyn
							currentPushDyn[uid] = item;
						}
						// logger
						this.logger.info("动态推送完毕！");
					}
				}
			}
			// 遍历currentPushDyn
			for (const uid in currentPushDyn) {
				// 获取动态发布时间
				const postTime = currentPushDyn[uid].modules.module_author.pub_ts;
				// 更新当前时间线
				this.dynamicTimelineManager.set(uid, postTime);
			}
		};
		// 返回一个闭包函数
		return withLock(handler);
	}

	debug_dynamicDetect() {
		// 定义handler
		const handler = async () => {
			// 定义本次请求推送的动态
			const currentPushDyn: Record<
				string,
				AllDynamicInfo["data"]["items"][number]
			> = {};
			// logger
			this.logger.info("开始获取动态信息...");
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
			// logger
			this.logger.info("获取动态信息成功！开始处理动态信息...");
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
				this.logger.info(
					`获取到动态信息，UP主：${name}，UID：${uid}，动态发布时间：${DateTime.fromSeconds(postTime).toFormat("yyyy-MM-dd HH:mm:ss")}`,
				);
				// 判断是否存在时间线
				if (this.dynamicTimelineManager.has(uid)) {
					// logger
					this.logger.info("订阅该UP主，判断动态时间线...");
					// 寻找关注的UP主
					const timeline = this.dynamicTimelineManager.get(uid);
					// logger
					this.logger.info(
						`上次推送时间线：${DateTime.fromSeconds(timeline).toFormat(
							"yyyy-MM-dd HH:mm:ss",
						)}`,
					);
					// 判断动态发布时间是否大于时间线
					if (timeline < postTime) {
						// logger
						this.logger.info("需要推送该条动态，开始推送...");
						// 获取订阅对象
						const sub = this.subManager.find((sub) => sub.uid === uid);
						// logger
						this.logger.info("开始渲染推送卡片...");
						// 推送该条动态
						const buffer = await withRetry(async () => {
							// 渲染图片
							return await this.ctx.gi.generateDynamicImg(
								item,
								sub.card.enable ? sub.card : undefined,
							);
						}, 1).catch(async (e) => {
							// 直播开播动态，不做处理
							if (e.message === "直播开播动态，不做处理") return;
							if (e.message === "出现关键词，屏蔽该动态") {
								// 如果需要发送才发送
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										sub.uid,
										<message>{name}发布了一条含有屏蔽关键字的动态</message>,
										PushType.Dynamic,
									);
								}
								return;
							}
							if (e.message === "已屏蔽转发动态") {
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										sub.uid,
										<message>{name}转发了一条动态，已屏蔽</message>,
										PushType.Dynamic,
									);
								}
								return;
							}
							if (e.message === "已屏蔽专栏动态") {
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										sub.uid,
										<message>{name}投稿了一条专栏，已屏蔽</message>,
										PushType.Dynamic,
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
						// logger
						this.logger.info("渲染推送卡片成功！");
						// 定义动态链接
						let dUrl = "";
						// 判断是否需要发送URL
						if (this.config.dynamicUrl) {
							// logger
							this.logger.info("需要发送动态链接，开始生成链接...");
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
							this.logger.info("动态链接生成成功！");
						}
						// logger
						this.logger.info("推送动态中...");
						// 发送推送卡片
						await this.broadcastToTargets(
							sub.uid,
							<message>
								{h.image(buffer, "image/jpeg")}
								{dUrl}
							</message>,
							PushType.Dynamic,
						);
						// 判断是否需要发送动态中的图片
						if (this.config.pushImgsInDynamic) {
							// logger
							this.logger.info("需要发送动态中的图片，开始发送...");
							// 判断是否为图文动态
							if (item.type === "DYNAMIC_TYPE_DRAW") {
								// 获取pics
								const pics = item.modules?.module_dynamic?.major?.opus?.pics;
								// 判断pics是否存在
								if (pics) {
									// 组合消息
									const picsMsg = (
										<message forward>
											{pics.map((pic) => (
												<img key={pic.url} src={pic.url} alt="动态图片" />
											))}
										</message>
									);
									// 发送消息
									await this.broadcastToTargets(
										sub.uid,
										picsMsg,
										PushType.Dynamic,
									);
								}
							}
							// logger
							this.logger.info("动态中的图片发送完毕！");
						}
						// 如果当前订阅对象已存在更早推送，则无需再更新时间线
						if (!currentPushDyn[uid]) {
							// 将当前动态存入currentPushDyn
							currentPushDyn[uid] = item;
						}
						// logger
						this.logger.info("动态推送完毕！");
					}
				}
			}
			// logger
			this.logger.info("动态信息处理完毕！");
			// 遍历currentPushDyn
			for (const uid in currentPushDyn) {
				// 获取动态发布时间
				const postTime = currentPushDyn[uid].modules.module_author.pub_ts;
				// 更新当前时间线
				this.dynamicTimelineManager.set(uid, postTime);
				// logger
				this.logger.info(
					`更新时间线成功，UP主：${uid}，时间线：${DateTime.fromSeconds(
						postTime,
					).toFormat("yyyy-MM-dd HH:mm:ss")}`,
				);
			}
			// logger
			this.logger.info(
				`本次推送动态数量：${Object.keys(currentPushDyn).length}`,
			);
		};
		// 返回一个闭包函数
		return withLock(handler);
	}

	async useMasterInfo(
		uid: string,
		masterInfo: MasterInfo,
		liveType: LiveType,
	): Promise<MasterInfo> {
		// 获取主播信息
		const { data } = (await this.ctx.ba.getMasterInfo(uid)) as MasterInfoR;
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

	async sendLiveNotifyCard(
		liveType: LiveType,
		followerDisplay: string,
		liveInfo: {
			// biome-ignore lint/suspicious/noExplicitAny: <any>
			liveRoomInfo: any;
			masterInfo: MasterInfo;
			cardStyle: SubItem["card"];
		},
		uid: string,
		liveNotifyMsg: string,
	) {
		// 生成图片
		const buffer = await withRetry(async () => {
			// 获取直播通知卡片
			return await this.ctx.gi.generateLiveImg(
				liveInfo.liveRoomInfo,
				liveInfo.masterInfo.username,
				liveInfo.masterInfo.userface,
				followerDisplay,
				liveType,
				liveInfo.cardStyle.enable ? liveInfo.cardStyle : undefined,
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
			<message>
				{h.image(buffer, "image/jpeg")}
				{liveNotifyMsg || ""}
			</message>
		);
		// 只有在开播时才艾特全体成员
		return await this.broadcastToTargets(
			uid,
			msg,
			liveType === LiveType.StartBroadcasting
				? PushType.StartBroadcasting
				: PushType.Live,
		);
	}

	async segmentDanmaku(
		danmaku: string,
		danmakuWeightRecord: Record<string, number>,
	) {
		// 分词
		this._jieba
			.cut(danmaku, true)
			.filter((word) => word.length >= 2 && !stopwords.has(word))
			.map((w) => {
				// 定义权重
				danmakuWeightRecord[w] = (danmakuWeightRecord[w] || 0) + 1;
			});
	}

	addUserToDanmakuMaker(
		username: string,
		danmakuMakerRecord: Record<string, number>,
	) {
		danmakuMakerRecord[username] = (danmakuMakerRecord[username] || 0) + 1;
	}

	async liveDetectWithListener(
		roomId: string,
		uid: string,
		cardStyle: SubItem["card"],
	) {
		// 定义开播时间
		let liveTime: string;
		// 定义定时推送定时器
		let pushAtTimeTimer: () => void;
		// 定义弹幕存放数组
		const danmakuWeightRecord: Record<string, number> = {};
		// 定义发送者及发言条数
		const danmakuMakerRecord: Record<string, number> = {};
		// 定义开播状态
		let liveStatus = false;
		// 定义数据
		// biome-ignore lint/suspicious/noExplicitAny: <any>
		let liveRoomInfo: any;
		let masterInfo: MasterInfo;
		let watchedNum: string;
		// 获取推送信息对象
		const liveMsgObj = this.liveMsgManager.get(uid);

		// 定义函数
		const sendDanmakuWordCloud = async () => {
			/* 制作弹幕词云 */
			this.logger.info("开始制作弹幕词云");
			this.logger.info("正在获取前90热词");
			// 拿到前90个热词
			const top90Words = Object.entries(danmakuWeightRecord)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 90);
			this.logger.info("弹幕词云前90词及权重：");
			this.logger.info(top90Words);
			this.logger.info("正在准备生成弹幕词云");
			// 生成弹幕词云图片
			const buffer = await this.ctx.gi.generateWordCloudImg(
				top90Words,
				masterInfo.username,
			);
			this.logger.info("弹幕词云生成完成，正在准备发送词云图片");
			// 发送词云图片
			await this.broadcastToTargets(
				uid,
				h.image(buffer, "image/jpeg"),
				PushType.Live,
			);
			// 词云图片发送完毕
			this.logger.info("词云图片发送完毕！");
			this.logger.info("开始构建弹幕发送排行榜消息");
			// 弹幕发送者数量
			const danmakuMakerCount = Object.keys(danmakuMakerRecord).length;
			// 弹幕条数
			const danmakuCount = Object.values(danmakuMakerRecord).reduce(
				(sum, val) => sum + val,
				0,
			);
			// 构建弹幕发送者排行
			const top5DanmakuMaker = Object.entries(danmakuMakerRecord)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5);
			// 构建消息
			const danmakuMakerMsg = this.config.liveSummary
				.replace("-dmc", `${danmakuMakerCount}`)
				.replace("-mdn", `${masterInfo.medalName}`)
				.replace("-dca", `${danmakuCount}`)
				.replace("-un1", `${top5DanmakuMaker[0][0]}`)
				.replace("-dc1", `${top5DanmakuMaker[0][1]}`)
				.replace("-un2", `${top5DanmakuMaker[1][0]}`)
				.replace("-dc2", `${top5DanmakuMaker[1][1]}`)
				.replace("-un3", `${top5DanmakuMaker[2][0]}`)
				.replace("-dc3", `${top5DanmakuMaker[2][1]}`)
				.replace("-un4", `${top5DanmakuMaker[3][0]}`)
				.replace("-dc4", `${top5DanmakuMaker[3][1]}`)
				.replace("-un5", `${top5DanmakuMaker[4][0]}`)
				.replace("-dc5", `${top5DanmakuMaker[4][1]}`)
				.replaceAll("\\n", "\n");
			// 发送弹幕排行榜消息
			await this.broadcastToTargets(uid, danmakuMakerMsg, PushType.Live);
			// 清理弹幕数据
			Object.keys(danmakuWeightRecord).forEach(
				(key) => delete danmakuWeightRecord[key],
			);
			Object.keys(danmakuMakerRecord).forEach(
				(key) => delete danmakuMakerRecord[key],
			);
		};

		// 定义定时推送函数
		const pushAtTimeFunc = async () => {
			// 判断是否信息是否获取成功
			if (!(await useMasterAndLiveRoomInfo(LiveType.LiveBroadcast))) {
				// 未获取成功，直接返回
				await this.sendPrivateMsg("获取直播间信息失败，推送直播卡片失败！");
				// 停止服务
				return await this.sendPrivateMsgAndStopService();
			}
			// 判断是否已经下播
			if (liveRoomInfo.live_status === 0 || liveRoomInfo.live_status === 2) {
				// 设置开播状态为false
				liveStatus = false;
				// 清除定时器
				pushAtTimeTimer?.();
				// 发送私聊消息
				await this.sendPrivateMsg(
					"直播间已下播！与直播间的连接可能已断开，请使用指令 sys restart 重启插件",
				);
				// 返回
				return;
			}
			// 设置开播时间
			liveTime = liveRoomInfo.live_time;
			// 获取watched
			const watched = watchedNum || "暂未获取到";
			// 设置直播中消息
			const liveMsg = liveMsgObj?.customLive
				.replace("-name", masterInfo.username)
				.replace("-time", await this.ctx.gi.getTimeDifference(liveTime))
				.replace("-watched", watched)
				.replaceAll("\\n", "\n")
				.replace(
					"-link",
					`https://live.bilibili.com/${liveRoomInfo.short_id === 0 ? liveRoomInfo.room_id : liveRoomInfo.short_id}`,
				);
			// 发送直播通知卡片
			await this.sendLiveNotifyCard(
				LiveType.LiveBroadcast,
				watched,
				{
					liveRoomInfo,
					masterInfo,
					cardStyle,
				},
				uid,
				liveMsg,
			);
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
			onError: async () => {
				// 更直播状态
				liveStatus = false;
				// 关闭定时推送
				pushAtTimeTimer?.();
				// 停止服务
				this.ctx.bl.closeListener(roomId);
				// 发送消息
				await this.sendPrivateMsg(`[${roomId}]直播间连接发生错误！`);
				this.logger.error(`[${roomId}]直播间连接发生错误！`);
			},
			onIncomeDanmu: ({ body }) => {
				// 分词
				this.segmentDanmaku(body.content, danmakuWeightRecord);
				// 添加发送者
				this.addUserToDanmakuMaker(body.user.uname, danmakuMakerRecord);
			},
			onIncomeSuperChat: ({ body }) => {
				// 分词
				this.segmentDanmaku(body.content, danmakuWeightRecord);
				// 添加发送者
				this.addUserToDanmakuMaker(body.user.uname, danmakuMakerRecord);
			},
			onWatchedChange: ({ body }) => {
				// 保存观看人数到变量
				watchedNum = body.text_small;
			},
			onGuardBuy: ({ body }) => {
				// 定义消息
				const content = (
					<message>
						【{masterInfo.username}的直播间】{body.user.uname}加入了大航海（
						{body.gift_name}）
					</message>
				);
				// 直接发送消息
				this.broadcastToTargets(uid, content, PushType.LiveGuardBuy);
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
					await this.sendPrivateMsg(
						"获取直播间信息失败，推送直播开播卡片失败！",
					);
					// 停止服务
					return await this.sendPrivateMsgAndStopService();
				}
				// 设置开播时间
				liveTime = liveRoomInfo.live_time;
				// 获取当前粉丝数
				const follower =
					masterInfo.liveOpenFollowerNum >= 10_000
						? `${(masterInfo.liveOpenFollowerNum / 10000).toFixed(1)}万`
						: masterInfo.liveOpenFollowerNum.toString();
				// 定义开播通知语
				const liveStartMsg = liveMsgObj?.customLiveStart
					.replace("-name", masterInfo.username)
					.replace("-time", await this.ctx.gi.getTimeDifference(liveTime))
					.replace("-follower", follower)
					.replaceAll("\\n", "\n")
					.replace(
						"-link",
						`https://live.bilibili.com/${liveRoomInfo.short_id === 0 ? liveRoomInfo.room_id : liveRoomInfo.short_id}`,
					);
				// 推送开播通知
				await this.sendLiveNotifyCard(
					LiveType.StartBroadcasting,
					follower,
					{
						liveRoomInfo,
						masterInfo,
						cardStyle,
					},
					uid,
					liveStartMsg,
				);
				// 判断定时器是否已开启
				if (this.config.pushTime !== 0 && !pushAtTimeTimer) {
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
					await this.sendPrivateMsg(
						"获取直播间信息失败，推送直播下播卡片失败！",
					);
					// 停止服务
					return await this.sendPrivateMsgAndStopService();
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
				const liveEndMsg = liveMsgObj?.customLiveEnd
					.replace("-name", masterInfo.username)
					.replace("-time", await this.ctx.gi.getTimeDifference(liveTime))
					.replace("-follower_change", followerChange)
					.replaceAll("\\n", "\n");
				// 推送通知卡片
				await this.sendLiveNotifyCard(
					LiveType.StopBroadcast,
					followerChange,
					{
						liveRoomInfo,
						masterInfo,
						cardStyle,
					},
					uid,
					liveEndMsg,
				);
				// 关闭定时推送定时器
				pushAtTimeTimer();
				// 将推送定时器变量置空
				pushAtTimeTimer = null;
				// 判断是否需要发送弹幕词云
				if (this.config.wordcloud) {
					// 发送弹幕词云
					await sendDanmakuWordCloud();
				}
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
			const liveMsg = liveMsgObj?.customLive
				.replace("-name", masterInfo.username)
				.replace("-time", await this.ctx.gi.getTimeDifference(liveTime))
				.replace("-watched", watched)
				.replaceAll("\\n", "\n")
				.replace(
					"-link",
					`https://live.bilibili.com/${liveRoomInfo.short_id === 0 ? liveRoomInfo.room_id : liveRoomInfo.short_id}`,
				);
			// 发送直播通知卡片
			if (this.config.restartPush) {
				await this.sendLiveNotifyCard(
					LiveType.LiveBroadcast,
					watched,
					{
						liveRoomInfo,
						masterInfo,
						cardStyle,
					},
					uid,
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
			}
			// 设置直播状态为true
			liveStatus = true;
		}
	}

	async liveDetectWithAPI() {
		// 定义直播间信息获取函数
		const useMasterAndLiveRoomInfo = async (
			liveType: LiveType,
			liveStatus: LiveStatus,
		) => {
			// 定义函数是否执行成功flag
			let flag = true;
			// 获取直播间信息
			liveStatus.liveRoomInfo = await this.useLiveRoomInfo(
				liveStatus.roomId,
			).catch(() => {
				// 设置flag为false
				flag = false;
				// 返回空
				return null;
			});
			// 判断是否成功获取信息
			if (!flag || !liveStatus.liveRoomInfo?.uid) {
				// 上一步未成功
				flag = false;
				// 返回flag
				return flag;
			}
			// 获取主播信息(需要满足flag为true，liveRoomInfo.uid有值)
			liveStatus.masterInfo = await this.useMasterInfo(
				liveStatus.liveRoomInfo.uid,
				liveStatus.masterInfo,
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

		const uids = [];
		for (const [uid] of this.liveStatusManager.entries()) {
			uids.push(uid);
		}

		const useLiveInfo = async () => {
			// 发送请求
			const { data }: Live | undefined = await withRetry(
				async () => (await this.ctx.ba.getLiveRoomInfoByUids(uids)) as Live,
				3,
			).catch(async () => {
				// 返回undefined
				return undefined;
			});

			if (!data) {
				// 停止服务
				await this.sendPrivateMsgAndStopService();
				// 返回
				return;
			}

			return data;
		};

		// 获取信息
		const data = await useLiveInfo();
		// 初始化
		for (const item of Object.values(data)) {
			// 将用户uid转换为string
			const uid = item.uid.toString();
			// 获取用户直播状态
			const liveStatus = this.liveStatusManager.get(uid);
			// 获取用户推送消息对象
			const liveMsgObj = this.liveMsgManager.get(uid);
			// 获取用户sub
			const sub = this.subManager.find((sub) => sub.uid === uid);
			// 判断直播状态
			if (item.live_status === 1) {
				// 将直播状态改为true
				liveStatus.live = true;
				// 初始化主播和直播间信息
				await useMasterAndLiveRoomInfo(LiveType.FirstLiveBroadcast, liveStatus);
				// 判断是否需要设置开播时间
				if (!liveStatus.liveStartTimeInit) {
					// 设置开播时间
					liveStatus.liveStartTime = liveStatus.liveRoomInfo.live_time;
					// 设置开播时间初始化状态
					liveStatus.liveStartTimeInit = true;
				}
				// 设置直播中消息
				const liveMsg = liveMsgObj?.customLive
					.replace("-name", liveStatus.masterInfo.username)
					.replace(
						"-time",
						await this.ctx.gi.getTimeDifference(liveStatus.liveStartTime),
					)
					.replace("-watched", "API模式无法获取")
					.replaceAll("\\n", "\n")
					.replace(
						"-link",
						`https://live.bilibili.com/${liveStatus.liveRoomInfo.short_id === 0 ? liveStatus.liveRoomInfo.room_id : liveStatus.liveRoomInfo.short_id}`,
					);
				// 发送直播通知卡片
				await this.sendLiveNotifyCard(
					LiveType.LiveBroadcast,
					"API",
					{
						liveRoomInfo: liveStatus.liveRoomInfo,
						masterInfo: liveStatus.masterInfo,
						cardStyle: sub.card,
					},
					sub.uid,
					liveMsg,
				);
			}
		}

		// 定义函数
		const handler = async () => {
			// 发送请求
			const data = await useLiveInfo();
			// 进行处理
			for (const item of Object.values(data)) {
				// 将用户uid转换为string
				const uid = item.uid.toString();
				// 获取用户直播状态
				const liveStatus = this.liveStatusManager.get(uid);
				// 获取用户推送消息对象
				const liveMsgObj = this.liveMsgManager.get(uid);
				// 获取sub
				const sub = this.subManager.find((sub) => sub.uid === uid);
				// 如果未找到sub直接返回
				if (!sub) return;
				// 判断当前状态和之前状态是否相同
				switch (item.live_status) {
					case 0:
					case 2: {
						// 未开播状态
						if (liveStatus.live === true) {
							// 现在下播了，发送下播通知
							// 判断信息是否获取成功
							if (
								!(await useMasterAndLiveRoomInfo(
									LiveType.StopBroadcast,
									liveStatus,
								))
							) {
								// 未获取成功，直接返回
								await this.sendPrivateMsg(
									"获取直播间信息失败，推送直播下播卡片失败！",
								);
								// 停止服务
								return await this.sendPrivateMsgAndStopService();
							}
							// 更改直播时长
							if (liveStatus.liveStartTimeInit) {
								// 设置直播时长
								liveStatus.liveRoomInfo.live_time = liveStatus.liveStartTime;
								// 直播时间初始化改为false
								liveStatus.liveStartTimeInit = false;
							}
							// 获取粉丝数变化
							const followerChange = (() => {
								// 获取直播关注变化值
								const liveFollowerChangeNum =
									liveStatus.masterInfo.liveFollowerChange;
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
							const liveEndMsg = liveMsgObj?.customLiveEnd
								.replace("-name", liveStatus.masterInfo.username)
								.replace(
									"-time",
									await this.ctx.gi.getTimeDifference(liveStatus.liveStartTime),
								)
								.replace("-follower_change", followerChange)
								.replaceAll("\\n", "\n");
							// 推送通知卡片
							await this.sendLiveNotifyCard(
								LiveType.StopBroadcast,
								followerChange,
								{
									liveRoomInfo: liveStatus.liveRoomInfo,
									masterInfo: liveStatus.masterInfo,
									cardStyle: sub.card,
								},
								sub.uid,
								liveEndMsg,
							);
							// 更改直播状态
							liveStatus.live = false;
						}
						// 还未开播
						break;
					}
					case 1: {
						// 开播状态
						if (liveStatus.live === false) {
							// 开播了
							// 判断信息是否获取成功
							if (
								!(await useMasterAndLiveRoomInfo(
									LiveType.StopBroadcast,
									liveStatus,
								))
							) {
								// 未获取成功，直接返回
								await this.sendPrivateMsg(
									"获取直播间信息失败，推送直播开播卡片失败！",
								);
								// 停止服务
								return await this.sendPrivateMsgAndStopService();
							}
							// 设置开播时间
							liveStatus.liveStartTime = liveStatus.liveRoomInfo.live_time;
							// 设置开播时间初始化状态
							liveStatus.liveStartTimeInit = true;
							// 获取当前粉丝数
							const follower =
								liveStatus.masterInfo.liveOpenFollowerNum >= 10_000
									? `${(liveStatus.masterInfo.liveOpenFollowerNum / 10000).toFixed(1)}万`
									: liveStatus.masterInfo.liveOpenFollowerNum.toString();
							// 定义开播通知语
							const liveStartMsg = liveMsgObj?.customLiveStart
								.replace("-name", liveStatus.masterInfo.username)
								.replace(
									"-time",
									await this.ctx.gi.getTimeDifference(liveStatus.liveStartTime),
								)
								.replace("-follower", follower)
								.replaceAll("\\n", "\n")
								.replace(
									"-link",
									`https://live.bilibili.com/${liveStatus.liveRoomInfo.short_id === 0 ? liveStatus.liveRoomInfo.room_id : liveStatus.liveRoomInfo.short_id}`,
								);
							// 推送开播通知
							await this.sendLiveNotifyCard(
								LiveType.StartBroadcasting,
								follower,
								{
									liveRoomInfo: liveStatus.liveRoomInfo,
									masterInfo: liveStatus.masterInfo,
									cardStyle: sub.card,
								},
								sub.uid,
								liveStartMsg,
							);
							// 设置开播状态为true
							liveStatus.live = true;
						}

						if (liveStatus.live === true) {
							// 还在直播
							if (liveStatus.push < (this.config.pushTime * 60 * 60) / 30) {
								// push++
								liveStatus.push++;
								// 结束本次循环
								break;
							}
							// 判断是否信息是否获取成功
							if (
								!(await useMasterAndLiveRoomInfo(
									LiveType.LiveBroadcast,
									liveStatus,
								))
							) {
								// 未获取成功，直接返回
								await this.sendPrivateMsg(
									"获取直播间信息失败，推送直播卡片失败！",
								);
								// 停止服务
								return await this.sendPrivateMsgAndStopService();
							}
							// 判断是否需要设置开播时间
							if (!liveStatus.liveStartTimeInit) {
								// 设置开播时间
								liveStatus.liveStartTime = liveStatus.liveRoomInfo.live_time;
								// 设置开播时间初始化状态
								liveStatus.liveStartTimeInit = true;
							}
							// 设置直播中消息
							const liveMsg = liveMsgObj?.customLive
								.replace("-name", liveStatus.masterInfo.username)
								.replace(
									"-time",
									await this.ctx.gi.getTimeDifference(liveStatus.liveStartTime),
								)
								.replace("-watched", "API模式无法获取")
								.replaceAll("\\n", "\n")
								.replace(
									"-link",
									`https://live.bilibili.com/${liveStatus.liveRoomInfo.short_id === 0 ? liveStatus.liveRoomInfo.room_id : liveStatus.liveRoomInfo.short_id}`,
								);
							// 发送直播通知卡片
							await this.sendLiveNotifyCard(
								LiveType.LiveBroadcast,
								"API",
								{
									liveRoomInfo: liveStatus.liveRoomInfo,
									masterInfo: liveStatus.masterInfo,
									cardStyle: sub.card,
								},
								sub.uid,
								liveMsg,
							);
							// push归零
							liveStatus.push = 0;
						}
						// 结束
						break;
					}
					default:
						break;
				}
			}
		};

		// 返回一个闭包函数
		return withLock(handler);
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

	async subUserInBili(mid: string): Promise<Result> {
		// 获取关注分组信息
		const checkGroupIsReady = async (): Promise<Result> => {
			// 判断是否有数据
			if (!this.loginDBData?.dynamic_group_id) {
				// 没有数据，没有创建分组，尝试创建分组
				const createGroupData = (await this.ctx.ba.createGroup(
					"订阅",
				)) as CreateGroup;
				// 如果分组已创建，则获取分组id
				if (createGroupData.code === 22106) {
					// 分组已存在，拿到之前的分组id
					const allGroupData = (await this.ctx.ba.getAllGroup()) as GroupList;
					// 遍历所有分组
					for (const group of allGroupData.data) {
						// 找到订阅分组
						if (group.name === "订阅") {
							// 拿到分组id
							this.loginDBData.dynamic_group_id = group.tagid.toString();
							// 保存到数据库
							this.ctx.database.set("loginBili", 1, {
								dynamic_group_id: this.loginDBData.dynamic_group_id,
							});
							// 返回分组已存在
							return { code: 0, msg: "分组已存在" };
						}
					}
				} else if (createGroupData.code !== 0) {
					// 创建分组失败
					return { code: createGroupData.code, msg: createGroupData.message };
				}
				// 创建成功，保存到数据库
				this.ctx.database.set("loginBili", 1, {
					dynamic_group_id: createGroupData.data.tagid.toString(),
				});
				// 创建成功
				return { code: createGroupData.code, msg: createGroupData.message };
			}
			return { code: 0, msg: "分组已存在" };
		};
		// 判断分组是否准备好
		const resp = await checkGroupIsReady();
		// 判断是否创建成功
		if (resp.code !== 0) return resp;
		// 获取分组详情
		const getGroupDetailData = async (): Promise<Result> => {
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
					if (resp.code !== 0) return resp;
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
			22002: () => {
				return {
					code: subUserData.code,
					msg: "因对方隐私设置，无法进行订阅操作",
				};
			},
			22003: () => {
				return {
					code: subUserData.code,
					msg: "你已将对方拉黑，无法进行订阅操作",
				};
			},
			22013: () => {
				return {
					code: subUserData.code,
					msg: "账号已注销，无法进行订阅操作",
				};
			},
			40061: () => {
				return {
					code: subUserData.code,
					msg: "账号不存在，请检查uid输入是否正确或用户是否存在",
				};
			},
			22001: () => {
				return {
					code: 0,
					msg: "订阅对象为自己，无需添加到分组",
				};
			},
			// 已订阅该对象
			22014: async () => {
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
			0: async () => {
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
		// 执行函数并返回
		return await subUserMatchPattern[subUserData.code]();
	}

	async loadSubFromConfig(subs: ComRegister.Config["sub"]): Promise<Result> {
		// 初始化pushRecord
		this.preInitConfig(subs);
		// 加载订阅
		for (const sub of subs) {
			// logger
			this.logger.info(`加载订阅UID:${sub.uid}中...`);
			// 定义Data
			const {
				code: userInfoCode,
				message: userInfoMsg,
				data: userInfoData,
			} = await withRetry(async () => {
				// 获取用户信息
				const data = await this.ctx.ba.getUserInfo(sub.uid);
				// 返回用户信息
				return { code: 0, data };
			})
				.then((content) => content.data)
				.catch((e) => {
					this.logger.error(
						`loadSubFromConfig() getUserInfo() 发生了错误，错误为：${e.message}`,
					);
					// 返回失败
					return { code: -1, message: `加载订阅UID:${sub.uid}失败！` };
				});
			// v_voucher风控
			if (userInfoCode === -352 && userInfoData.v_voucher) {
				// logger
				this.logger.info("账号被风控，请使用指令 bili captcha 进行风控验证");
				// 发送私聊消息
				await this.sendPrivateMsg(
					"账号被风控，请使用指令 bili cap 进行风控验证",
				);
				return { code: userInfoCode, msg: userInfoMsg };
			}
			// 判断是否获取成功
			if (userInfoCode !== 0) return { code: userInfoCode, msg: userInfoMsg };
			// 判断是否需要订阅直播
			if (this.config.liveDetectType === "WS" && sub.live) {
				// 检查roomid是否存在
				if (!userInfoData.live_room) {
					// 用户没有开通直播间，无法订阅直播
					sub.live = false;
					// 发送提示
					this.logger.warn(`UID:${sub.uid} 用户没有开通直播间，无法订阅直播！`);
				}
				// 判断是否订阅直播
				if (sub.live) {
					// 启动直播监测
					await this.liveDetectWithListener(
						userInfoData.live_room.roomid,
						sub.uid,
						sub.card,
					);
				}
			}
			// 在B站中订阅该对象
			const subInfo = await this.subUserInBili(sub.uid);
			// 判断订阅是否成功
			if (subInfo.code !== 0) return subInfo;
			// 将该订阅添加到sm中
			this.subManager.push({
				id: +sub.uid,
				uid: sub.uid,
				uname: userInfoData.name,
				roomId: sub.live ? userInfoData.live_room.roomid : "",
				target: sub.target,
				platform: "",
				live: sub.live,
				dynamic: sub.dynamic,
				card: sub.card,
				liveMsg: sub.liveMsg,
			});
			// logger
			this.logger.info(`UID:${sub.uid}订阅加载完毕！`);
			// 1-3秒随机延迟
			const randomDelay = Math.floor(Math.random() * 3) + 1;
			// logger
			this.logger.info(`随机延迟:${randomDelay}秒`);
			// delay
			await this.ctx.sleep(randomDelay * 1000);
		}
		return { code: 0, msg: "订阅加载完毕！" };
	}

	checkIfDynamicDetectIsNeeded() {
		// 检查是否有订阅对象需要动态监测
		if (this.dynamicTimelineManager.size > 0) {
			// 启动动态监测
			this.enableDynamicDetect();
		}
	}

	checkIfLiveDetectIsNeeded() {
		// 判断直播监测类型
		if (this.config.liveDetectType === "API") {
			// 检查是否有订阅对象需要直播监测
			if (this.liveStatusManager.size > 0) {
				// 启动直播监测
				this.enableLiveDetect();
			}
		}
	}

	enableDynamicDetect() {
		// 定义Job
		this.dynamicJob = new CronJob(
			this.config.dynamicCron,
			this.config.dynamicDebugMode
				? this.debug_dynamicDetect()
				: this.dynamicDetect(),
		);
		// logger
		this.logger.info("动态监测已开启");
		// 开始动态监测
		this.dynamicJob.start();
	}

	async enableLiveDetect() {
		// 定义Job
		this.liveJob = new CronJob(
			"*/30 * * * * *",
			await this.liveDetectWithAPI(),
		);
		// logger
		this.logger.info("直播监测已开启");
		// 开始直播监测
		this.liveJob.start();
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
		sub: Array<{
			uid: string;
			dynamic: boolean;
			live: boolean;
			target: Array<{
				channelArr: Array<{
					channelId: string;
					dynamic: boolean;
					live: boolean;
					liveGuardBuy: boolean;
					atAll: boolean;
					bot: string;
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
			liveMsg: {
				enable: boolean;
				customLiveStart: string;
				customLive: string;
				customLiveEnd: string;
			};
		}>;
		master: {
			enable: boolean;
			platform: string;
			masterAccount: string;
			masterAccountGuildId: string;
		};
		liveDetectType: string;
		wordcloud: boolean;
		liveSummary: string;
		restartPush: boolean;
		pushTime: number;
		pushImgsInDynamic: boolean;
		liveLoopTime: number;
		customLiveStart: string;
		customLive: string;
		customLiveEnd: string;
		dynamicUrl: boolean;
		dynamicCron: string;
		dynamicVideoUrlToBV: boolean;
		filter: {
			enable: boolean;
			notify: boolean;
			regex: string;
			keywords: Array<string>;
		};
		dynamicDebugMode: boolean;
	}

	export const Config: Schema<Config> = Schema.object({
		sub: Schema.array(
			Schema.object({
				uid: Schema.string().description("订阅用户UID"),
				dynamic: Schema.boolean().description("是否订阅用户动态"),
				live: Schema.boolean().description("是否订阅用户直播"),
				target: Schema.array(
					Schema.object({
						channelArr: Schema.array(
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
								bot: Schema.string().description(
									"若您有多个相同平台机器人，可在此填写当前群聊执行推送的机器人账号。不填则默认第一个",
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
				liveMsg: Schema.object({
					enable: Schema.boolean(),
					customLiveStart: Schema.string(),
					customLive: Schema.string(),
					customLiveEnd: Schema.string(),
				}),
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
		liveDetectType: Schema.string(),
		wordcloud: Schema.boolean(),
		liveSummary: Schema.string(),
		restartPush: Schema.boolean().required(),
		pushTime: Schema.number().required(),
		pushImgsInDynamic: Schema.boolean().required(),
		liveLoopTime: Schema.number().default(10),
		customLiveStart: Schema.string().required(),
		customLive: Schema.string(),
		customLiveEnd: Schema.string().required(),
		dynamicUrl: Schema.boolean().required(),
		dynamicCron: Schema.string().required(),
		dynamicVideoUrlToBV: Schema.boolean().required(),
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
