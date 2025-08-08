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
import type { MsgHandler } from "blive-message-listener";
import QRCode from "qrcode";
import { CronJob } from "cron";
// Utils
import { withLock, withRetry } from "./utils";
// Types
import {
	type AllDynamicInfo,
	type ChannelArr,
	type CreateGroup,
	type DynamicTimelineManager,
	type GroupList,
	type Live,
	type LiveMsg,
	type LiveMsgManager,
	type LiveAPIStatus,
	type LiveWSManager,
	LiveType,
	type LiveUsers,
	type MasterInfo,
	type MasterInfoR,
	type PushArrMap,
	PushType,
	PushTypeMsg,
	type Result,
	type SubManager,
	type Subscription,
	type Subscriptions,
	type Target,
	type LiveAPIManager,
} from "./type";
import { DateTime } from "luxon";
import { Jieba } from "@node-rs/jieba";
import { dict } from "@node-rs/jieba/dict";
import definedStopWords from "./stop_words";

class ComRegister {
	// 必须服务
	static inject = [
		"bilibili-notify",
		"bilibili-notify-api",
		"bilibili-notify-live",
		"bilibili-notify-generate-img",
		"database",
	];
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
	subManager: SubManager;
	// 动态时间线管理器
	dynamicTimelineManager: DynamicTimelineManager;
	// 直播状态管理器(API)
	liveAPIManager: LiveAPIManager;
	// 直播状态管理器(WS)
	liveWSManager: LiveWSManager;
	// 直播推送消息管理器
	liveMsgManager: LiveMsgManager;
	// PushArrMap
	pushArrMap: PushArrMap;
	// 检查登录数据库是否有数据
	loginDBData: FlatPick<LoginBili, "dynamic_group_id">;
	// 机器人实例
	privateBot: Bot<Context>;
	// 动态检测销毁函数
	dynamicJob: CronJob;
	// 直播检测销毁函数
	liveAPIJob: CronJob;
	// 创建segmentit
	_jieba = Jieba.withDict(dict);
	// 停用词
	stopwords: Set<string>;
	// recive subs times
	reciveSubTimes = 0;
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
					content = await ctx["bilibili-notify-api"].getLoginQRCode();
				} catch (_) {
					return "bili login getLoginQRCode() 本次网络请求失败";
				}
				// 判断是否出问题
				if (content.code !== 0) return await session.send("出问题咯！");
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
							loginContent = await ctx["bilibili-notify-api"].getLoginStatus(
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
							const encryptedCookies = ctx["bilibili-notify-api"].encrypt(
								ctx["bilibili-notify-api"].getCookies(),
							);
							const encryptedRefreshToken = ctx["bilibili-notify-api"].encrypt(
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
							await this.ctx["bilibili-notify-api"].loadCookiesFromDatabase();
							// 判断登录信息是否已加载完毕
							await this.checkIfLoginInfoIsLoaded();
							// 销毁定时器
							this.loginTimer();
							// 清除控制台通知
							ctx["bilibili-notify-api"].disposeNotifier();
							// 发送成功登录推送
							await session.send("登录成功，请重启插件");
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
				} = (await ctx[
					"bilibili-notify-api"
				].getTheUserWhoIsLiveStreaming()) as {
					data: { live_users: LiveUsers };
				};
				// 定义当前正在直播且订阅的UP主列表
				const subLiveUsers: Array<{
					uid: number;
					uname: string;
					onLive: boolean;
				}> = [];
				// 获取当前订阅的UP主
				for (const [uid, sub] of this.subManager) {
					// 定义开播标志位
					let onLive = false;
					// 判断items是否存在
					if (live_users.items) {
						// 遍历liveUsers
						for (const user of live_users.items) {
							// 判断是否是订阅直播的UP
							if (user.mid.toString() === uid && sub.live) {
								// 设置标志位为true
								onLive = true;
								// break
								break;
							}
						}
					}
					// 判断是否未开播
					subLiveUsers.push({
						uid: Number.parseInt(uid),
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
				const content =
					await this.ctx["bilibili-notify-api"].getUserSpaceDynamic(uid);
				// 获取动态内容
				const item = content.data.items[i];
				// 生成图片
				const buffer = await withRetry(async () => {
					// 渲染图片
					return await this.ctx[
						"bilibili-notify-generate-img"
					].generateDynamicImg(item);
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

			const img = h.image(
				await this.ctx["bilibili-notify-generate-img"].generateWordCloudImg(
					words,
					"词云测试",
				),
				"image/jpg",
			);

			const top5DanmakuMaker = [
				["张三", 60],
				["李四", 48],
				["王五", 45],
				["赵六", 27],
				["田七", 25],
			];

			const summary = this.config.liveSummary
				.join("\n")
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

			await session.send(h("message", [img, h.text(summary)]));
		});

		biliCom.subcommand(".cap").action(async ({ session }) => {
			const { code: userInfoCode, data: userInfoData } = await withRetry(
				async () => {
					// 获取用户信息
					const data =
						await this.ctx["bilibili-notify-api"].getUserInfo("114514");
					// 返回用户信息
					return { code: 0, data };
				},
			).then((content) => content.data);
			// 判断是否满足风控条件
			if (userInfoCode !== -352 || !userInfoData.v_voucher)
				return "不满足验证条件，不需要执行该命令，如果提示风控可以尝试重启插件";
			// 开始进行风控验证
			const { data } = await ctx["bilibili-notify-api"].v_voucherCaptcha(
				userInfoData.v_voucher,
			);
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
			await session.send("请直接输入validate");
			// 等待输入
			const validate = await session.prompt();
			// seccode
			const seccode = `${validate}|jordan`;
			// 验证结果
			const { data: validateCaptchaData } = await ctx[
				"bilibili-notify-api"
			].validateCaptcha(data.geetest.challenge, data.token, validate, seccode);
			// 判断验证是否成功
			if (validateCaptchaData?.is_valid !== 1) return "验证不成功！";
			// Sleep
			await this.ctx.sleep(10 * 1000);
			// 再次请求
			const { code: validCode, data: validData } = await ctx[
				"bilibili-notify-api"
			].getUserInfo("114514", validateCaptchaData.grisk_id);
			// 再次验证
			if (validCode === -352 && validData.v_voucher) return "验证不成功！";
			// 验证成功
			await session.send("验证成功！请重启插件");
		});
	}

	async init(config: ComRegister.Config) {
		// 设置logger
		this.logger = this.ctx.logger("bilibili-notify-core");
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
		// 合并停用词
		this.mergeStopWords(config.wordcloudStopWords);
		// 注册事件
		this.registeringForEvents();
		// 判断是否是高级订阅
		if (config.advancedSub) {
			// logger
			this.logger.info("开启高级订阅，等待加载订阅...");
			// 触发准备就绪事件
			this.ctx.emit("bilibili-notify/ready-to-recive");
		} else {
			// 从配置获取订阅
			if (config.subs && config.subs.length > 0) {
				// 转化订阅
				const subs = this.configSubsToSubscription(config.subs);
				// 加载后续部分
				await this.initAsyncPart(subs);
			} else this.logger.info("初始化完毕，未添加任何订阅！");
		}
	}

	registeringForEvents() {
		// 注册插件销毁函数
		this.ctx.on("dispose", () => {
			// 销毁登录定时器
			if (this.loginTimer) this.loginTimer();
			// 销毁动态监测
			if (this.dynamicJob) this.dynamicJob.stop();
			// 销毁直播监测
			if (this.liveAPIJob) this.liveAPIJob.stop();
			// 遍历WS管理器
			for (const [roomId, timer] of this.liveWSManager) {
				// 关闭直播监听
				this.ctx["bilibili-notify-live"].closeListener(roomId);
				// 关闭cron
				if (timer) timer();
			}
		});
		// 监听bilibili-notify事件
		this.ctx.on("bilibili-notify/advanced-sub", async (subs: Subscriptions) => {
			if (Object.keys(subs).length === 0) {
				// logger
				this.logger.info("初始化完毕，未添加任何订阅！");
				// 返回
				return;
			}
			// 判断是否超过一次接收
			if (this.reciveSubTimes >= 1)
				await this.ctx["bilibili-notify"].restartPlugin();
			// 初始化后续部分
			else await this.initAsyncPart(subs);
			// +1
			this.reciveSubTimes++;
		});
	}

	async initAsyncPart(subs: Subscriptions) {
		// 初始化管理器
		this.initAllManager();
		// logger
		this.logger.info("获取到订阅信息，开始加载订阅...");
		// 加载订阅
		const { code, message } = await this.loadSubFromConfig(subs);
		// 判断是否加载成功
		if (code !== 0) {
			// logger
			this.logger.error(message);
			this.logger.error("订阅对象加载失败，插件初始化失败！");
			// 发送私聊消息
			await this.sendPrivateMsg("订阅对象加载失败，插件初始化失败！");
			// 返回
			return;
		}
		// 初始化管理器
		this.initManager();
		// 检查是否需要动态监测
		this.checkIfDynamicDetectIsNeeded();
		// 检查是否需要直播监测(仅API模式)
		this.checkIfLiveDetectIsNeeded();
		// 在控制台中显示订阅对象
		this.updateSubNotifier();
		// 初始化完毕
		this.logger.info("插件初始化完毕！");
	}

	mergeStopWords(stopWordsStr: string) {
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

	initManager() {
		for (const [uid, sub] of this.subManager) {
			// 判断是否订阅动态
			if (sub.dynamic) {
				this.dynamicTimelineManager.set(
					uid,
					Math.floor(DateTime.now().toSeconds()),
				);
			}
			// 判断是否订阅直播
			if (sub.live) {
				// 设置到直播状态管理对象
				this.liveAPIManager.set(uid, {
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

	initAllManager() {
		this.subManager = new Map();
		this.dynamicTimelineManager = new Map();
		this.liveAPIManager = new Map();
		this.liveWSManager = new Map();
		this.liveMsgManager = new Map();
		this.pushArrMap = new Map();
	}

	configSubsToSubscription(sub: ComRegister.Config["subs"]) {
		const subs: Subscriptions = {};
		// 补充完整订阅配置
		sub.forEach((s) => {
			// 获取channels
			const channelArr: ChannelArr = s.target.split(",").map((channelId) => ({
				channelId,
				dynamic: s.dynamic,
				dynamicAtAll: s.dynamicAtAll,
				live: s.live,
				liveAtAll: s.liveAtAll,
				liveGuardBuy: s.liveGuardBuy,
				wordcloud: s.wordcloud,
				liveSummary: s.liveSummary,
			}));
			// 组装Target
			const target: Target = [{ channelArr, platform: s.platform }];
			// 拆分uid和roomid
			const [uid, roomid] = s.uid.split(",");
			// 组装sub
			subs[s.name] = {
				uname: s.name,
				uid,
				roomid,
				dynamic: s.dynamic,
				live: s.live,
				target,
				customCardStyle: { enable: false },
				customLiveMsg: { enable: false },
				customLiveSummary: { enable: false },
			};
		});
		// 返回subs
		return subs;
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
				this.logger.error(
					`${this.privateBot.platform} 机器人未初始化完毕，无法进行推送`,
				);
				// 返回
				return;
			}
			// 判断是否填写群组号
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
				"已重启插件三次，请检查机器人状态后使用指令 bn start 启动插件",
			);
			// 重启失败，发送消息
			await this.sendPrivateMsg(
				"已重启插件三次，请检查机器人状态后使用指令 bn start 启动插件",
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
			this.logger.info("重启插件成功");
		} else {
			// logger
			this.logger.error(
				"重启插件失败，请检查机器人状态后使用指令 bn start 启动插件",
			);
			// 重启失败，发送消息
			await this.sendPrivateMsg(
				"重启插件失败，请检查机器人状态后使用指令 bn start 启动插件",
			);
			// 关闭插件
			await this.ctx["bilibili-notify"].disposePlugin();
		}
	}

	async sendPrivateMsgAndStopService() {
		// 发送消息
		await this.sendPrivateMsg(
			"插件发生未知错误，请检查机器人状态后使用指令 bn start 启动插件",
		);
		// logger
		this.logger.error(
			"插件发生未知错误，请检查机器人状态后使用指令 bn start 启动插件",
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
					`发送群组ID:${channelId}消息失败！原因: ${e.message}`,
				);
				await this.sendPrivateMsg(
					`发送群组ID:${channelId}消息失败，请查看日志`,
				);
			},
		);
	}

	preInitConfig(subs: Subscriptions) {
		// 遍历subs
		for (const sub of Object.values(subs)) {
			// 构建直播推送消息对象
			const liveMsg: LiveMsg = {
				customLiveStart: this.config.customLiveStart || "",
				customLive: this.config.customLive || "",
				customLiveEnd: this.config.customLiveEnd || "",
				liveSummary: this.config.liveSummary.join("\n") || "",
			};
			// 判断是否个性化推送消息
			if (sub.customLiveMsg.enable) {
				liveMsg.customLiveStart =
					sub.customLiveMsg.customLiveStart || this.config.customLiveStart;
				liveMsg.customLive =
					sub.customLiveMsg.customLive || this.config.customLive;
				liveMsg.customLiveEnd =
					sub.customLiveMsg.customLiveEnd || this.config.customLiveEnd;
			}
			if (sub.customLiveSummary.enable) {
				liveMsg.liveSummary =
					sub.customLiveSummary.liveSummary ||
					this.config.liveSummary.join("\n");
			}
			// 设置到直播推送消息管理对象
			this.liveMsgManager.set(sub.uid, liveMsg);

			// PushRecord part

			// 定义数组
			const dynamicArr: Array<string> = [];
			const dynamicAtAllArr: Array<string> = [];
			const liveArr: Array<string> = [];
			const liveAtAllArr: Array<string> = [];
			const liveGuardBuyArr: Array<string> = [];
			const wordcloudArr: Array<string> = [];
			const liveSummaryArr: Array<string> = [];
			// 遍历target
			for (const platform of sub.target) {
				// 遍历channelArr
				for (const channel of platform.channelArr) {
					// 构建目标
					const target = `${platform.platform}:${channel.channelId}`;
					// 定义条件
					const conditions: [keyof typeof channel, typeof dynamicArr][] = [
						["dynamic", dynamicArr],
						["dynamicAtAll", dynamicAtAllArr],
						["live", liveArr],
						["liveAtAll", liveAtAllArr],
						["liveGuardBuy", liveGuardBuyArr],
						["wordcloud", wordcloudArr],
						["liveSummary", liveSummaryArr],
					];
					// 判断
					for (const [key, arr] of conditions) {
						if (channel[key]) arr.push(target);
					}
				}
			}
			// 组装record
			this.pushArrMap.set(sub.uid, {
				dynamicArr,
				dynamicAtAllArr,
				liveArr,
				liveAtAllArr,
				liveSummaryArr,
				liveGuardBuyArr,
				wordcloudArr,
			});
		}
		// logger
		this.logger.info("初始化推送群组/频道信息：");
		this.logger.info(this.pushArrMap);
	}

	// biome-ignore lint/suspicious/noExplicitAny: <message>
	async pushMessage(targets: Array<string>, content: any, retry = 3000) {
		// 初始化目标
		const t: Record<string, Array<string>> = {};
		// 遍历获取target
		for (const target of targets) {
			// 分解平台和群组
			const [platform, channleId] = target.split(":");
			// 将平台群组添加到Record中
			// 如果不存则初始化数组
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
			const sendMessageByBot = async (channelId: string, botIndex = 0) => {
				// 判断机器人状态
				if (bots[botIndex].status !== Universal.Status.ONLINE) {
					// 有机器人未准备好，直接返回
					this.logger.error(
						`${platform} 机器人未初始化完毕，无法进行推送，${retry / 1000}秒后重试`,
					);
					// 重试
					this.ctx.setTimeout(async () => {
						await this.pushMessage(targets, content, retry * 2);
					}, retry);
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
					this.logger.error(e);
					// 判断是否还有其他机器人
					if (bots.length > 1) await sendMessageByBot(channelId, botIndex++);
				}
			};
			// 发送消息
			for (const channelId of t[platform]) {
				await sendMessageByBot(channelId);
			}
			// logger
			this.logger.info(`成功推送消息 ${num} 条`);
		}
	}

	async broadcastToTargets(
		uid: string,
		// biome-ignore lint/suspicious/noExplicitAny: <any>
		content: any,
		type: PushType,
	) {
		// 发起推送
		this.logger.info(`本次推送对象：${uid}，推送类型：${PushTypeMsg[type]}`);
		// 拿到需要推送的record
		const record = this.pushArrMap.get(uid);
		// 推送record
		this.logger.info("本次推送目标：");
		// 判断是否需要艾特全体成员
		if (
			type === PushType.StartBroadcasting &&
			record.liveAtAllArr?.length >= 1
		) {
			this.logger.info(record.liveAtAllArr);
			// 深拷贝
			const atAllArr = structuredClone(record.liveAtAllArr);
			// 艾特全体
			await withRetry(async () => {
				return await this.pushMessage(atAllArr, h.at("all"));
			}, 1);
		}
		// 推送动态
		if (type === PushType.Dynamic && record.dynamicArr?.length >= 1) {
			if (record.dynamicAtAllArr?.length >= 1) {
				this.logger.info(record.dynamicAtAllArr);
				// 深拷贝
				const dynamicAtAllArr = structuredClone(record.dynamicAtAllArr);
				// 艾特全体
				await withRetry(async () => {
					return await this.pushMessage(dynamicAtAllArr, h.at("all"));
				}, 1);
			}
			this.logger.info(record.dynamicArr);
			// 深拷贝
			const dynamicArr = structuredClone(record.dynamicArr);
			// 推送动态
			await withRetry(async () => {
				return await this.pushMessage(dynamicArr, h("message", content));
			}, 1);
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
			await withRetry(async () => {
				return await this.pushMessage(liveArr, h("message", content));
			}, 1);
		}
		// 推送直播守护购买
		if (type === PushType.LiveGuardBuy && record.liveGuardBuyArr?.length >= 1) {
			this.logger.info(record.liveGuardBuyArr);
			// 深拷贝
			const liveGuardBuyArr = structuredClone(record.liveGuardBuyArr);
			// 推送直播守护购买
			await withRetry(async () => {
				return await this.pushMessage(
					liveGuardBuyArr,
					h(h.Fragment, h(content)),
				);
			}, 1);
		}
		// 推送词云
		if (type === PushType.WordCloudAndLiveSummary) {
			// 深拷贝
			const wordcloudArr = structuredClone(record.wordcloudArr);
			const liveSummaryArr = structuredClone(record.liveSummaryArr);
			// 获取需要推送词云和直播总结的群组
			const wordcloudAndLiveSummaryArr = wordcloudArr.filter((item) =>
				liveSummaryArr.includes(item),
			);
			// 获取只需要推送词云的群组
			const wordcloudOnlyArr = wordcloudArr.filter(
				(item) => !liveSummaryArr.includes(item),
			);
			// 获取只需要推送直播总结的群组
			const liveSummaryOnlyArr = liveSummaryArr.filter(
				(item) => !wordcloudArr.includes(item),
			);
			// 推送需要词云和直播总结的群组
			if (wordcloudAndLiveSummaryArr.length > 0) {
				this.logger.info("词云和直播总结");
				this.logger.info(wordcloudAndLiveSummaryArr);
				// 推送词云和直播总结
				await withRetry(async () => {
					return await this.pushMessage(
						wordcloudAndLiveSummaryArr,
						h("message", [content[0], content[1]]),
					);
				}, 1);
			}
			// 推送只需要词云的群组
			if (wordcloudOnlyArr.length > 0) {
				this.logger.info("词云");
				this.logger.info(wordcloudOnlyArr);
				// 推送词云
				await withRetry(async () => {
					return await this.pushMessage(
						wordcloudOnlyArr,
						h("message", [content[0]]),
					);
				}, 1);
			}
			// 推送只需要直播总结的群组
			if (liveSummaryOnlyArr.length > 0) {
				this.logger.info("直播总结");
				this.logger.info(liveSummaryOnlyArr);
				// 推送直播总结
				await withRetry(async () => {
					return await this.pushMessage(
						liveSummaryOnlyArr,
						h("message", [content[1]]),
					);
				}, 1);
			}
		}
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
				return (await this.ctx[
					"bilibili-notify-api"
				].getAllDynamic()) as AllDynamicInfo;
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
						this.logger.error("账号未登录，插件已停止工作，请登录");
						// 发送私聊消息
						await this.sendPrivateMsg("账号未登录，插件已停止工作，请登录");
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
					case -352: {
						// 风控
						this.logger.error(
							"账号被风控，插件已停止工作，请输入指令 bili cap 根据提示解除风控",
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							"账号被风控，插件已停止工作，请输入指令 bili cap 根据提示解除风控",
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
					default: {
						// 未知错误
						this.logger.error(
							`获取动态信息错误，错误码为：${content.code}，错误为：${content.message}，请排除错误后输入指令 bn start 重启插件`,
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							`获取动态信息错误，错误码为：${content.code}，错误为：${content.message}，请排除错误后输入指令 bn start 重启插件`,
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
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
						const sub = this.subManager.get(uid);
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
							if (e.message === "出现关键词，屏蔽该动态") {
								// 如果需要发送才发送
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										uid,
										h("message", `${name}发布了一条含有屏蔽关键字的动态`),
										PushType.Dynamic,
									);
								}
								return;
							}
							if (e.message === "已屏蔽转发动态") {
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										uid,
										h("message", `${name}转发了一条动态，已屏蔽`),
										PushType.Dynamic,
									);
								}
								return;
							}
							if (e.message === "已屏蔽专栏动态") {
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										uid,
										h("message", `${name}投稿了一条专栏，已屏蔽`),
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
							uid,
							h("message", [h.image(buffer, "image/jpeg"), h.text(dUrl)]),
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
									const picsMsg = h(
										"message",
										{ forward: true },
										pics.map((pic) => h.img(pic.url)),
									);
									// 发送消息
									await this.broadcastToTargets(uid, picsMsg, PushType.Dynamic);
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
				return (await this.ctx[
					"bilibili-notify-api"
				].getAllDynamic()) as AllDynamicInfo;
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
						this.logger.error("账号未登录，插件已停止工作，请登录");
						// 发送私聊消息
						await this.sendPrivateMsg("账号未登录，插件已停止工作，请登录");
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
					case -352: {
						// 风控
						// 输出日志
						this.logger.error(
							"账号被风控，插件已停止工作，请输入指令 bili cap 根据提示解除风控",
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							"账号被风控，插件已停止工作，请输入指令 bili cap 根据提示解除风控",
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
					default: {
						// 未知错误
						this.logger.error(
							`获取动态信息错误，错误码为：${content.code}，错误为：${content.message}，请排除错误后输入指令 bn start 重启插件`,
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							`获取动态信息错误，错误码为：${content.code}，错误为：${content.message}，请排除错误后输入指令 bn start 重启插件`,
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
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
						const sub = this.subManager.get(uid);
						// logger
						this.logger.info("开始渲染推送卡片...");
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
							if (e.message === "出现关键词，屏蔽该动态") {
								// 如果需要发送才发送
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										uid,
										h("message", `${name}发布了一条含有屏蔽关键字的动态`),
										PushType.Dynamic,
									);
								}
								return;
							}
							if (e.message === "已屏蔽转发动态") {
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										uid,
										h("message", `${name}转发了一条动态，已屏蔽`),
										PushType.Dynamic,
									);
								}
								return;
							}
							if (e.message === "已屏蔽专栏动态") {
								if (this.config.filter.notify) {
									await this.broadcastToTargets(
										uid,
										h("message", `${name}投稿了一条专栏，已屏蔽`),
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
							uid,
							h("message", [h.image(buffer, "image/jpeg"), h.text(dUrl)]),
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
									const picsMsg = h(
										"message",
										{ forward: true },
										pics.map((pic) => h.img(pic.url)),
									);
									// 发送消息
									await this.broadcastToTargets(uid, picsMsg, PushType.Dynamic);
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

	async useLiveRoomInfo(roomId: string) {
		// 发送请求获取直播间信息
		const data = await withRetry(
			async () => await this.ctx["bilibili-notify-api"].getLiveRoomInfo(roomId),
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
		const msg = h("message", [
			h.image(buffer, "image/jpeg"),
			h.text(liveNotifyMsg || ""),
		]);
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
			.filter((word) => word.length >= 2 && !this.stopwords.has(word))
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

	async liveDetectWithListener(sub: Subscription) {
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
		const liveMsgObj = this.liveMsgManager.get(sub.uid);
		// 定义函数
		const sendDanmakuWordCloudAndLiveSummary = async (
			customLiveSummary: string,
		) => {
			/* 制作弹幕词云 */
			this.logger.info("开始制作弹幕词云");
			this.logger.info("正在获取前90热词");
			// 获取数据
			const words = Object.entries(danmakuWeightRecord);
			const danmaker = Object.entries(danmakuMakerRecord);
			// 判断是否不足50词
			if (words.length < 50) {
				// logger
				this.logger.info("热词不足50个，本次弹幕词云放弃");
				// 返回
				return;
			}
			// 判断是否不足五人发言
			if (danmaker.length < 5) {
				// logger
				this.logger.info("发言人数不足5位，本次弹幕词云放弃");
				// 返回
				return;
			}
			// 拿到前90个热词
			const top90Words = words.sort((a, b) => b[1] - a[1]).slice(0, 90);
			this.logger.info("弹幕词云前90词及权重：");
			this.logger.info(top90Words);
			this.logger.info("正在准备生成弹幕词云");
			// 生成弹幕词云图片
			const buffer = await this.ctx[
				"bilibili-notify-generate-img"
			].generateWordCloudImg(top90Words, masterInfo.username);
			// 构建图片消息
			const img = h.image(buffer, "image/jpeg");
			// logger
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
			const summary = customLiveSummary
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
			// 发送消息
			await this.broadcastToTargets(
				sub.uid,
				[img, summary],
				PushType.WordCloudAndLiveSummary,
			);
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
					"直播间已下播！与直播间的连接可能已断开，请使用指令 bn restart 重启插件",
				);
				// 返回
				return;
			}
			// 设置开播时间
			liveTime = liveRoomInfo.live_time;
			// 获取watched
			const watched = watchedNum || "暂未获取到";
			// 设置直播中消息
			const liveMsg = liveMsgObj.customLive
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
				watched,
				{
					liveRoomInfo,
					masterInfo,
					cardStyle: sub.customCardStyle,
				},
				sub.uid,
				liveMsg,
			);
		};

		// 定义直播间信息获取函数
		const useMasterAndLiveRoomInfo = async (liveType: LiveType) => {
			// 定义函数是否执行成功flag
			let flag = true;
			// 获取直播间信息
			liveRoomInfo = await this.useLiveRoomInfo(sub.roomid).catch(() => {
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
				this.ctx["bilibili-notify-live"].closeListener(sub.roomid);
				// 发送消息
				await this.sendPrivateMsg(`[${sub.roomid}]直播间连接发生错误！`);
				this.logger.error(`[${sub.roomid}]直播间连接发生错误！`);
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
				const content = h("message", [
					h.text(
						`【${masterInfo.username}的直播间】${body.user.uname}加入了大航海（${body.gift_name}）`,
					),
				]);
				// 直接发送消息
				this.broadcastToTargets(sub.uid, content, PushType.LiveGuardBuy);
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
				const liveStartMsg = liveMsgObj.customLiveStart
					.replace("-name", masterInfo.username)
					.replace(
						"-time",
						await this.ctx["bilibili-notify-generate-img"].getTimeDifference(
							liveTime,
						),
					)
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
						cardStyle: sub.customCardStyle,
					},
					sub.uid,
					liveStartMsg,
				);
				// 判断定时器是否已开启
				if (this.config.pushTime !== 0 && !pushAtTimeTimer) {
					// 开始直播，开启定时器
					pushAtTimeTimer = this.ctx.setInterval(
						pushAtTimeFunc,
						this.config.pushTime * 1000 * 60 * 60,
					);
					// 将定时器送入管理器
					this.liveWSManager.set(sub.roomid, pushAtTimeTimer);
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
				const liveEndMsg = liveMsgObj.customLiveEnd
					.replace("-name", masterInfo.username)
					.replace(
						"-time",
						await this.ctx["bilibili-notify-generate-img"].getTimeDifference(
							liveTime,
						),
					)
					.replace("-follower_change", followerChange)
					.replaceAll("\\n", "\n");
				// 推送通知卡片
				await this.sendLiveNotifyCard(
					LiveType.StopBroadcast,
					followerChange,
					{
						liveRoomInfo,
						masterInfo,
						cardStyle: sub.customCardStyle,
					},
					sub.uid,
					liveEndMsg,
				);
				// 关闭定时推送定时器
				pushAtTimeTimer();
				// 将推送定时器变量置空
				pushAtTimeTimer = null;
				// 发送弹幕词云和直播总结
				await sendDanmakuWordCloudAndLiveSummary(liveMsgObj.liveSummary);
			},
		};
		// 启动直播间弹幕监测
		await this.ctx["bilibili-notify-live"].startLiveRoomListener(
			sub.roomid,
			handler,
		);
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
			const liveMsg = liveMsgObj.customLive
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
				await this.sendLiveNotifyCard(
					LiveType.LiveBroadcast,
					watched,
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
				this.liveWSManager.set(sub.roomid, pushAtTimeTimer);
			}
			// 设置直播状态为true
			liveStatus = true;
		}
	}

	async liveDetectWithAPI() {
		// 定义直播间信息获取函数
		const useMasterAndLiveRoomInfo = async (
			liveType: LiveType,
			LiveAPIStatus: LiveAPIStatus,
		) => {
			// 定义函数是否执行成功flag
			let flag = true;
			// 获取直播间信息
			LiveAPIStatus.liveRoomInfo = await this.useLiveRoomInfo(
				LiveAPIStatus.roomId,
			).catch(() => {
				// 设置flag为false
				flag = false;
				// 返回空
				return null;
			});
			// 判断是否成功获取信息
			if (!flag || !LiveAPIStatus.liveRoomInfo?.uid) {
				// 上一步未成功
				flag = false;
				// 返回flag
				return flag;
			}
			// 获取主播信息(需要满足flag为true，liveRoomInfo.uid有值)
			LiveAPIStatus.masterInfo = await this.useMasterInfo(
				LiveAPIStatus.liveRoomInfo.uid,
				LiveAPIStatus.masterInfo,
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
		for (const [uid] of this.liveAPIManager.entries()) {
			uids.push(uid);
		}

		const useLiveInfo = async () => {
			// 发送请求
			const { data }: Live | undefined = await withRetry(
				async () =>
					(await this.ctx["bilibili-notify-api"].getLiveRoomInfoByUids(
						uids,
					)) as Live,
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
			const LiveAPIStatus = this.liveAPIManager.get(uid);
			// 获取用户推送消息对象
			const liveMsgObj = this.liveMsgManager.get(uid);
			// 获取用户sub
			const sub = this.subManager.get(uid);
			// 判断直播状态
			if (item.live_status === 1) {
				// 将直播状态改为true
				LiveAPIStatus.live = true;
				// 初始化主播和直播间信息
				await useMasterAndLiveRoomInfo(
					LiveType.FirstLiveBroadcast,
					LiveAPIStatus,
				);
				// 判断是否需要设置开播时间
				if (!LiveAPIStatus.liveStartTimeInit) {
					// 设置开播时间
					LiveAPIStatus.liveStartTime = LiveAPIStatus.liveRoomInfo.live_time;
					// 设置开播时间初始化状态
					LiveAPIStatus.liveStartTimeInit = true;
				}
				// 设置直播中消息
				const liveMsg = liveMsgObj.customLive
					.replace("-name", LiveAPIStatus.masterInfo.username)
					.replace(
						"-time",
						await this.ctx["bilibili-notify-generate-img"].getTimeDifference(
							LiveAPIStatus.liveStartTime,
						),
					)
					.replace("-watched", "API模式无法获取")
					.replaceAll("\\n", "\n")
					.replace(
						"-link",
						`https://live.bilibili.com/${LiveAPIStatus.liveRoomInfo.short_id === 0 ? LiveAPIStatus.liveRoomInfo.room_id : LiveAPIStatus.liveRoomInfo.short_id}`,
					);
				// 发送直播通知卡片
				await this.sendLiveNotifyCard(
					LiveType.LiveBroadcast,
					"API",
					{
						liveRoomInfo: LiveAPIStatus.liveRoomInfo,
						masterInfo: LiveAPIStatus.masterInfo,
						cardStyle: sub.customCardStyle,
					},
					uid,
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
				const LiveAPIStatus = this.liveAPIManager.get(uid);
				// 获取用户推送消息对象
				const liveMsgObj = this.liveMsgManager.get(uid);
				// 获取sub
				const sub = this.subManager.get(uid);
				// 如果未找到sub直接返回
				if (!sub) return;
				// 判断当前状态和之前状态是否相同
				switch (item.live_status) {
					case 0:
					case 2: {
						// 未开播状态
						if (LiveAPIStatus.live === true) {
							// 现在下播了，发送下播通知
							// 判断信息是否获取成功
							if (
								!(await useMasterAndLiveRoomInfo(
									LiveType.StopBroadcast,
									LiveAPIStatus,
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
							if (LiveAPIStatus.liveStartTimeInit) {
								// 设置直播时长
								LiveAPIStatus.liveRoomInfo.live_time =
									LiveAPIStatus.liveStartTime;
								// 直播时间初始化改为false
								LiveAPIStatus.liveStartTimeInit = false;
							}
							// 获取粉丝数变化
							const followerChange = (() => {
								// 获取直播关注变化值
								const liveFollowerChangeNum =
									LiveAPIStatus.masterInfo.liveFollowerChange;
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
							const liveEndMsg = liveMsgObj.customLiveEnd
								.replace("-name", LiveAPIStatus.masterInfo.username)
								.replace(
									"-time",
									await this.ctx[
										"bilibili-notify-generate-img"
									].getTimeDifference(LiveAPIStatus.liveStartTime),
								)
								.replace("-follower_change", followerChange)
								.replaceAll("\\n", "\n");
							// 推送通知卡片
							await this.sendLiveNotifyCard(
								LiveType.StopBroadcast,
								followerChange,
								{
									liveRoomInfo: LiveAPIStatus.liveRoomInfo,
									masterInfo: LiveAPIStatus.masterInfo,
									cardStyle: sub.customCardStyle,
								},
								uid,
								liveEndMsg,
							);
							// 更改直播状态
							LiveAPIStatus.live = false;
						}
						// 还未开播
						break;
					}
					case 1: {
						// 开播状态
						if (LiveAPIStatus.live === false) {
							// 开播了
							// 判断信息是否获取成功
							if (
								!(await useMasterAndLiveRoomInfo(
									LiveType.StopBroadcast,
									LiveAPIStatus,
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
							LiveAPIStatus.liveStartTime =
								LiveAPIStatus.liveRoomInfo.live_time;
							// 设置开播时间初始化状态
							LiveAPIStatus.liveStartTimeInit = true;
							// 获取当前粉丝数
							const follower =
								LiveAPIStatus.masterInfo.liveOpenFollowerNum >= 10_000
									? `${(LiveAPIStatus.masterInfo.liveOpenFollowerNum / 10000).toFixed(1)}万`
									: LiveAPIStatus.masterInfo.liveOpenFollowerNum.toString();
							// 定义开播通知语
							const liveStartMsg = liveMsgObj.customLiveStart
								.replace("-name", LiveAPIStatus.masterInfo.username)
								.replace(
									"-time",
									await this.ctx[
										"bilibili-notify-generate-img"
									].getTimeDifference(LiveAPIStatus.liveStartTime),
								)
								.replace("-follower", follower)
								.replaceAll("\\n", "\n")
								.replace(
									"-link",
									`https://live.bilibili.com/${LiveAPIStatus.liveRoomInfo.short_id === 0 ? LiveAPIStatus.liveRoomInfo.room_id : LiveAPIStatus.liveRoomInfo.short_id}`,
								);
							// 推送开播通知
							await this.sendLiveNotifyCard(
								LiveType.StartBroadcasting,
								follower,
								{
									liveRoomInfo: LiveAPIStatus.liveRoomInfo,
									masterInfo: LiveAPIStatus.masterInfo,
									cardStyle: sub.customCardStyle,
								},
								uid,
								liveStartMsg,
							);
							// 设置开播状态为true
							LiveAPIStatus.live = true;
						}

						if (LiveAPIStatus.live === true) {
							// 还在直播
							if (LiveAPIStatus.push < (this.config.pushTime * 60 * 60) / 30) {
								// push++
								LiveAPIStatus.push++;
								// 结束本次循环
								break;
							}
							// 判断是否信息是否获取成功
							if (
								!(await useMasterAndLiveRoomInfo(
									LiveType.LiveBroadcast,
									LiveAPIStatus,
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
							if (!LiveAPIStatus.liveStartTimeInit) {
								// 设置开播时间
								LiveAPIStatus.liveStartTime =
									LiveAPIStatus.liveRoomInfo.live_time;
								// 设置开播时间初始化状态
								LiveAPIStatus.liveStartTimeInit = true;
							}
							// 设置直播中消息
							const liveMsg = liveMsgObj.customLive
								.replace("-name", LiveAPIStatus.masterInfo.username)
								.replace(
									"-time",
									await this.ctx[
										"bilibili-notify-generate-img"
									].getTimeDifference(LiveAPIStatus.liveStartTime),
								)
								.replace("-watched", "API模式无法获取")
								.replaceAll("\\n", "\n")
								.replace(
									"-link",
									`https://live.bilibili.com/${LiveAPIStatus.liveRoomInfo.short_id === 0 ? LiveAPIStatus.liveRoomInfo.room_id : LiveAPIStatus.liveRoomInfo.short_id}`,
								);
							// 发送直播通知卡片
							await this.sendLiveNotifyCard(
								LiveType.LiveBroadcast,
								"API",
								{
									liveRoomInfo: LiveAPIStatus.liveRoomInfo,
									masterInfo: LiveAPIStatus.masterInfo,
									cardStyle: sub.customCardStyle,
								},
								uid,
								liveMsg,
							);
							// push归零
							LiveAPIStatus.push = 0;
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
		for (const [uid, sub] of this.subManager) {
			table += `UID:${uid}  ${sub.dynamic ? "已订阅动态" : ""}  ${sub.live ? "已订阅直播" : ""}\n`;
		}
		return table ? table : "没有订阅任何UP";
	}

	updateSubNotifier() {
		// 更新控制台提示
		if (this.subNotifier) this.subNotifier.dispose();
		// 获取订阅信息
		const subInfo = this.subShow();
		// 定义table
		// biome-ignore lint/suspicious/noExplicitAny: <any>
		let table: any = "";
		if (subInfo === "没有订阅任何UP") {
			table = subInfo;
		} else {
			// 获取subTable
			const subTableArray = subInfo.split("\n");
			subTableArray.splice(subTableArray.length - 1, 1);
			// 定义Table
			table = h(h.Fragment, [
				h("p", "当前订阅对象："),
				h(
					"ul",
					subTableArray.map((str) => h("li", str)),
				),
			]);
		}
		// 设置更新后的提示
		this.subNotifier = this.ctx.notifier.create(table);
	}

	async checkIfLoginInfoIsLoaded() {
		return new Promise((resolve) => {
			const check = () => {
				if (!this.ctx["bilibili-notify-api"].getLoginInfoIsLoaded()) {
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
			// 获取所有分组
			const allGroupData = (await this.ctx[
				"bilibili-notify-api"
			].getAllGroup()) as GroupList;
			// 定义存在标志
			let existFlag = false;
			// 遍历所有分组
			for (const group of allGroupData.data) {
				// 找到订阅分组
				if (group.name === "订阅") {
					// 判断是否和保存的一致
					if (this.loginDBData.dynamic_group_id !== group.tagid.toString()) {
						// 拿到分组id
						this.loginDBData.dynamic_group_id = group.tagid.toString();
						// 保存到数据库
						this.ctx.database.set("loginBili", 1, {
							dynamic_group_id: this.loginDBData.dynamic_group_id,
						});
					}
					// 更改存在标志位
					existFlag = true;
				}
			}
			// 判断是否有数据
			if (!existFlag) {
				// 没有数据，没有创建分组，尝试创建分组
				const createGroupData = (await this.ctx[
					"bilibili-notify-api"
				].createGroup("订阅")) as CreateGroup;
				// 如果分组已创建，则获取分组id
				if (createGroupData.code !== 0) {
					// 创建分组失败
					return {
						code: createGroupData.code,
						message: createGroupData.message,
					};
				}
				// 创建成功，保存到数据库
				this.ctx.database.set("loginBili", 1, {
					dynamic_group_id: createGroupData.data.tagid.toString(),
				});
				// 创建成功
				return { code: createGroupData.code, message: createGroupData.message };
			}
			return { code: 0, message: "分组已存在" };
		};
		// 判断分组是否准备好
		const resp = await checkGroupIsReady();
		// 判断是否创建成功
		if (resp.code !== 0) return resp;
		// 获取分组详情
		const getGroupDetailData = async (): Promise<Result> => {
			// 获取分组明细
			const relationGroupDetailData = await this.ctx[
				"bilibili-notify-api"
			].getRelationGroupDetail(this.loginDBData.dynamic_group_id);
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
					message: relationGroupDetailData.message,
					data: undefined,
				};
			}
			return {
				code: 0,
				message: "获取分组明细成功",
				data: relationGroupDetailData.data,
			};
		};
		// 获取分组明细
		const { code, message, data } = await getGroupDetailData();
		// 判断获取分组明细是否成功
		if (code !== 0) {
			return { code, message };
		}
		// 判断是否已经订阅该对象
		for (const user of data) {
			if (user.mid === mid) {
				// 已关注订阅对象
				return { code: 0, message: "订阅对象已存在于分组中" };
			}
		}
		// 订阅对象
		const subUserData = (await this.ctx["bilibili-notify-api"].follow(mid)) as {
			code: number;
			message: string;
		};
		// 模式匹配
		const subUserMatchPattern = {
			[-101]: () => {
				return {
					code: subUserData.code,
					message: "账号未登录，请使用指令bili login登录后再进行订阅操作",
				};
			},
			[-102]: () => {
				return {
					code: subUserData.code,
					message: "账号被封停，无法进行订阅操作",
				};
			},
			22002: () => {
				return {
					code: subUserData.code,
					message: "因对方隐私设置，无法进行订阅操作",
				};
			},
			22003: () => {
				return {
					code: subUserData.code,
					message: "你已将对方拉黑，无法进行订阅操作",
				};
			},
			22013: () => {
				return {
					code: subUserData.code,
					message: "账号已注销，无法进行订阅操作",
				};
			},
			40061: () => {
				return {
					code: subUserData.code,
					message: "账号不存在，请检查uid输入是否正确或用户是否存在",
				};
			},
			22001: () => {
				return {
					code: 0,
					message: "订阅对象为自己，无需添加到分组",
				};
			},
			// 已订阅该对象
			22014: async () => {
				// 把订阅对象添加到分组中
				const copyUserToGroupData = await this.ctx[
					"bilibili-notify-api"
				].copyUserToGroup(mid, this.loginDBData.dynamic_group_id);
				// 判断是否添加成功
				if (copyUserToGroupData.code !== 0) {
					// 添加失败
					return {
						code: copyUserToGroupData.code,
						message: "添加订阅对象到分组失败，请稍后重试",
					};
				}
				// 添加成功
				return { code: 0, message: "订阅对象添加成功" };
			},
			22015: async () => {
				return { code: subUserData.code, message: subUserData.message };
			},
			// 订阅成功
			0: async () => {
				// 把订阅对象添加到分组中
				const copyUserToGroupData = await this.ctx[
					"bilibili-notify-api"
				].copyUserToGroup(mid, this.loginDBData.dynamic_group_id);
				// 判断是否添加成功
				if (copyUserToGroupData.code !== 0) {
					// 添加失败
					return {
						code: copyUserToGroupData.code,
						message: "添加订阅对象到分组失败，请稍后重试",
					};
				}
				// 添加成功
				return { code: 0, message: "订阅对象添加成功" };
			},
		};
		// 获取函数
		const subUserExecute =
			subUserMatchPattern[subUserData.code] ||
			(() => {
				return { code: subUserData.code, message: subUserData.message };
			});
		// 执行函数并返回
		return await subUserExecute();
	}

	async loadSubFromConfig(subs: Subscriptions): Promise<Result> {
		// 初始化pushRecord
		this.preInitConfig(subs);
		// 加载订阅
		for (const sub of Object.values(subs)) {
			// logger
			this.logger.info(`加载订阅UID:${sub.uid}中...`);
			// 判断是否有直播间号
			if (sub.live && !sub.roomid) {
				// logger
				this.logger.info(`UID:${sub.uid} 请求了用户接口~`);
				// 定义Data
				const {
					code: userInfoCode,
					message: userInfoMsg,
					data: userInfoData,
				} = await withRetry(async () => {
					// 获取用户信息
					const data = await this.ctx["bilibili-notify-api"].getUserInfo(
						sub.uid,
					);
					// 返回数据
					return data;
				}).catch((e) => {
					this.logger.error(
						`loadSubFromConfig() getUserInfo() 发生了错误，错误为：${e.message}`,
					);
					// 返回失败
					return { code: -1, message: `加载订阅UID:${sub.uid}失败！` };
				});
				// v_voucher风控
				if (userInfoCode === -352 && userInfoData.v_voucher) {
					// logger
					this.logger.info("账号被风控，请使用指令 bili cap 进行风控验证");
					// 发送私聊消息
					await this.sendPrivateMsg(
						"账号被风控，请使用指令 bili cap 进行风控验证",
					);
					return { code: userInfoCode, message: userInfoMsg };
				}
				// 判断是否获取成功
				if (userInfoCode !== 0)
					return { code: userInfoCode, message: userInfoMsg };
				// 检查roomid是否存在
				if (sub.live && !userInfoData.live_room) {
					// 用户没有开通直播间，无法订阅直播
					sub.live = false;
					// 发送提示
					this.logger.warn(`UID:${sub.uid} 用户没有开通直播间，无法订阅直播！`);
				}
				// 将roomid设置进去
				sub.roomid = userInfoData.live_room?.roomid;
			}
			// 判断是否需要订阅直播
			if (sub.live && sub.roomid && this.config.liveDetectType === "WS") {
				// 启动直播监测
				await this.liveDetectWithListener(sub);
			}
			// 在B站中订阅该对象
			const subInfo = await this.subUserInBili(sub.uid);
			// 判断订阅是否成功
			if (subInfo.code !== 0) return subInfo;
			// 将该订阅添加到sm中
			this.subManager.set(sub.uid, {
				uname: sub.uname,
				roomId: sub.roomid,
				target: sub.target,
				live: sub.live,
				dynamic: sub.dynamic,
				customCardStyle: sub.customCardStyle,
				customLiveMsg: sub.customLiveMsg,
				customLiveSummary: sub.customLiveSummary,
			});
			// logger
			this.logger.info(`UID:${sub.uid} 订阅加载完毕！`);

			// 判断是不是最后一个订阅
			if (sub !== Object.values(subs).pop()) {
				// 不是最后一个订阅，执行delay
				// 1-3秒随机延迟
				const randomDelay = Math.floor(Math.random() * 3) + 1;
				// logger
				this.logger.info(`随机延迟:${randomDelay}秒`);
				// delay
				await this.ctx.sleep(randomDelay * 1000);
			}
		}
		return { code: 0, message: "订阅加载完毕！" };
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
			if (this.liveAPIManager.size > 0) {
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
		this.liveAPIJob = new CronJob(
			"*/30 * * * * *",
			await this.liveDetectWithAPI(),
		);
		// logger
		this.logger.info("直播监测已开启");
		// 开始直播监测
		this.liveAPIJob.start();
	}

	async checkIfIsLogin() {
		if ((await this.ctx.database.get("loginBili", 1)).length !== 0) {
			// 数据库中有数据
			// 检查cookie中是否有值
			if (this.ctx["bilibili-notify-api"].getCookies() !== "[]") {
				// 有值说明已登录
				return true;
			}
		}
		return false;
	}
}

namespace ComRegister {
	export interface Config {
		advancedSub: boolean;
		subs: Array<{
			name: string;
			uid: string;
			dynamic: boolean;
			dynamicAtAll: boolean;
			live: boolean;
			liveAtAll: boolean;
			liveGuardBuy: boolean;
			wordcloud: boolean;
			liveSummary: boolean;
			platform: string;
			target: string;
		}>;
		master: {
			enable: boolean;
			platform: string;
			masterAccount: string;
			masterAccountGuildId: string;
		};
		liveDetectType: string;
		wordcloudStopWords: string;
		liveSummary: Array<string>;
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
		advancedSub: Schema.boolean(),
		subs: Schema.array(
			Schema.object({
				name: Schema.string().required().description("备注"),
				uid: Schema.string().required().description("UID"),
				dynamic: Schema.boolean().default(true).description("动态"),
				dynamicAtAll: Schema.boolean().default(false).description("动态At全体"),
				live: Schema.boolean().default(true).description("直播"),
				liveAtAll: Schema.boolean().default(true).description("直播At全体"),
				liveGuardBuy: Schema.boolean().default(false).description("上舰消息"),
				wordcloud: Schema.boolean().default(true).description("弹幕词云"),
				liveSummary: Schema.boolean().default(true).description("直播总结"),
				platform: Schema.string().required().description("平台名"),
				target: Schema.string().required().description("群号/频道号"),
			}),
		)
			.role("table")
			.description(
				"输入订阅信息，自定义订阅内容； 群号/频道号格式：频道号,频道号 使用英文逗号分隔，例如 1234567,2345678",
			),
		master: Schema.object({
			enable: Schema.boolean(),
			platform: Schema.string(),
			masterAccount: Schema.string(),
			masterAccountGuildId: Schema.string(),
		}),
		liveDetectType: Schema.string(),
		wordcloudStopWords: Schema.string(),
		liveSummary: Schema.array(String),
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
