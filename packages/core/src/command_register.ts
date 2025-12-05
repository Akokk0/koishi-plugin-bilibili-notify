// Koishi核心依赖
// biome-ignore assist/source/organizeImports: <import type>
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
import { GuardLevel, type MsgHandler } from "blive-message-listener";
import QRCode from "qrcode";
import { CronJob } from "cron";
// Utils
import { replaceButKeep, withLock, withRetry } from "./utils";
// Types
import {
	type AllDynamicInfo,
	type ChannelArr,
	type CreateGroup,
	type DynamicTimelineManager,
	type GroupList,
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
	type LiveRoomInfo,
	type LiveData,
	type UserInfoInLiveData,
	BiliLoginStatus,
	type MySelfInfoData,
	type UserCardInfoData,
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
	// GroupInfo
	// biome-ignore lint/suspicious/noExplicitAny: <data>
	groupInfo: any | null = null;
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
				await this.sendPrivateMsg(
					`主人～女仆向您问好啦！Ciallo～(∠・ω< )⌒★乖乖打招呼呀 (>ω<)♡`,
				);
				// 发送提示
				await session.send(
					"主人～女仆已经发送消息啦～如果主人没收到，可能是机器人不支持发送私聊消息，或者主人填写的信息有误哦 (>ω<)♡",
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
				// 判断是否存在live_users
				if (live_users?.items) {
					// 获取当前订阅的UP主
					for (const [uid, sub] of this.subManager) {
						// 定义开播标志位
						let onLive = false;
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
						// 判断是否未开播
						subLiveUsers.push({
							uid: Number.parseInt(uid, 10),
							uname: sub.uname,
							onLive,
						});
					}
				}
				// 定义table字符串
				let table = "";
				// 遍历liveUsers
				if (subLiveUsers.length === 0) {
					table += "当前没有正在直播的订阅对象";
				} else {
					for (const user of subLiveUsers) {
						table += `[UID:${user.uid}] 「${user.uname}」 ${user.onLive ? "正在直播" : "未开播"}\n`;
					}
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
						await session.send(
							"主人～女仆发现直播开播动态啦，但女仆不处理哦 (>ω<)♡",
						);
						return;
					}
					if (e.message === "出现关键词，屏蔽该动态") {
						await session.send("主人～女仆已经屏蔽了这条动态啦 (>ω<)♡");
						return;
					}
					if (e.message === "已屏蔽转发动态") {
						await session.send("主人～女仆已经屏蔽了这条转发动态啦 (>ω<)♡");
						return;
					}
					if (e.message === "已屏蔽专栏动态") {
						await session.send("主人～女仆已经屏蔽了这条专栏动态啦 (>ω<)♡");
						return;
					}
					// 未知错误
					this.logger.error(
						`主人呜呜 (；>_<) 女仆在执行 dynamicDetect generateDynamicImg() 时推送卡片发送失败啦～原因：${e.message}，请主人帮女仆看看呀 (>ω<)♡`,
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
				return "主人～女仆发现不满足验证条件呢～所以这个命令不用执行哦 (>ω<)♡ 如果提示风控，主人可以尝试重启插件看看呀 (*>ω<)b";
			// 开始进行风控验证
			const { data } = await ctx["bilibili-notify-api"].v_voucherCaptcha(
				userInfoData.v_voucher,
			);
			// 判断是否能进行风控验证
			if (!data.geetest) {
				return "主人呜呜 (；>_<) 女仆发现当前风控无法通过验证解除哦～主人可能需要考虑人工申诉呢 (>ω<)♡";
			}
			// 发送提示消息消息
			await session.send(
				"主人～请到这个网站进行验证操作哦～乖乖跟着做，女仆也会帮主人关注进度呢 (〃>ω<〃) https://kuresaru.github.io/geetest-validator/",
			);
			await session.send(
				"主人～请手动填入 gt 和 challenge，然后点击生成进行验证哦～验证完成后再点击结果，并根据提示输入对应的 validate，女仆会在一旁乖乖等主人完成呢 (>ω<)♡",
			);
			// gt 和 challenge
			await session.send(`gt:${data.geetest.gt}`);
			await session.send(`challenge:${data.geetest.challenge}`);
			// 发送等待输入消息 validate
			await session.send(
				"主人～验证完成啦～请直接输入 validate 告诉女仆哦 (>ω<)♡",
			);
			// 等待输入
			const validate = await session.prompt();
			// seccode
			const seccode = `${validate}|jordan`;
			// 验证结果
			const { data: validateCaptchaData } = await ctx[
				"bilibili-notify-api"
			].validateCaptcha(data.geetest.challenge, data.token, validate, seccode);
			// 判断验证是否成功
			if (validateCaptchaData?.is_valid !== 1)
				return "主人呜呜 (；>_<) 验证没有成功呢～请主人再试一次呀 (>ω<)♡";
			// Sleep
			await this.ctx.sleep(10 * 1000);
			// 再次请求
			const { code: validCode, data: validData } = await ctx[
				"bilibili-notify-api"
			].getUserInfo("114514", validateCaptchaData.grisk_id);
			// 再次验证
			if (validCode === -352 && validData.v_voucher)
				return "主人呜呜 (；>_<) 验证没有成功呢～请主人再试一次呀 (>ω<)♡";
			// 验证成功
			await session.send(
				"主人～验证成功啦！请主人重启插件，女仆会乖乖继续工作哦 (>ω<)♡",
			);
		});

		biliCom.subcommand(".ai").action(async () => {
			this.logger.info("开始生成AI直播总结");

			const liveSummaryData = {
				medalName: "特工",
				danmakuSenderCount: "56",
				danmakuCount: "778",
				top5DanmakuSender: [
					["张三", 71],
					["李四", 67],
					["王五", 57],
					["赵六", 40],
					["田七", 31],
				],
				top10Word: [
					["摆烂", 91],
					["可以", 82],
					["dog", 40],
					["不是", 37],
					["就是", 27],
					["吃瓜", 16],
					["cj", 8],
					["没有", 8],
					["有点", 8],
					["喜欢", 7],
					["空调", 7],
				],
				liveStartTime: "2025-07-21 12:56:05",
				liveEndTime: "2025-07-21 15:40:30",
			};

			const res = await this.ctx["bilibili-notify-api"].chatWithAI(
				`请你生成直播总结，用这样的风格，多使用emoji并且替换示例中的emoji，同时要对每个人进行个性化点评，一下是风格参考：
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

			this.logger.info("AI 生成完毕，结果为：");
			this.logger.info(res.choices[0].message.content);
		});

		biliCom.subcommand(".img").action(async ({ session }) => {
			// 舰长图片
			const guardImg = ComRegister.GUARD_LEVEL_IMG[GuardLevel.Jianzhang];
			const buffer = await this.ctx[
				"bilibili-notify-generate-img"
			].generateBoardingImg(
				guardImg,
				{
					guardLevel: GuardLevel.Jianzhang,
					face: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQSESgEED4WoyK9O5FFgrV8cHZPM4w4JgleZQ&s",
					uname: "恶魔兔",
					isAdmin: 1,
				},
				{
					masterName: "籽岷",
					masterAvatarUrl:
						"https://img.touxiangkong.com/uploads/allimg/20203301251/2020/3/BjEbyu.jpg",
				},
			);
			await session.send(h.image(buffer, "image/jpeg"));
		});
	}

	async init(config: ComRegister.Config) {
		// 设置logger
		this.logger = this.ctx.logger("bilibili-notify-core");
		// logger
		this.logger.info("主人～女仆正在努力初始化插件中呢…请稍等一下哦 (>///<)♡");
		// 将config设置给类属性
		this.config = config;
		// 注册事件
		this.registeringForEvents();
		// 拿到私人机器人实例
		this.privateBot = this.ctx.bots.find(
			(bot) => bot.platform === config.master.platform,
		);
		if (!this.privateBot) {
			this.ctx.notifier.create({
				content:
					"主人呜呜 (；>_<) 您还没有配置主人账号呢～女仆没办法向您推送插件运行状态啦，请快点配置哦 (>ω<)♡",
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
			this.logger.info(
				"主人…呜呜 (；>_<) 女仆发现账号还没登录呢，请主人快点登录好让女仆继续工作呀 (>ω<)♡",
			);
			return;
		}
		// 已登录，请求个人信息
		const personalInfo = (await this.ctx[
			"bilibili-notify-api"
		].getMyselfInfo()) as MySelfInfoData;
		// 判断是否获取成功
		if (personalInfo.code !== 0) {
			// 发送事件消息
			this.ctx.emit("bilibili-notify/login-status-report", {
				status: BiliLoginStatus.LOGGED_IN,
				msg: "主人…呜呜 (；>_<) 虽然账号已登录，但女仆获取个人信息失败啦，请主人检查一下呀 (>ω<)♡",
			});
		}
		// 获取个人卡片信息
		const myCardInfo = (await this.ctx["bilibili-notify-api"].getUserCardInfo(
			personalInfo.data.mid.toString(),
			true,
		)) as UserCardInfoData;
		// 发送事件消息
		this.ctx.emit("bilibili-notify/login-status-report", {
			status: BiliLoginStatus.LOGGED_IN,
			msg: "已登录",
			data: myCardInfo.data,
		});
		// 合并停用词
		this.mergeStopWords(config.wordcloudStopWords);
		// 初始化管理器
		this.initAllManager();
		// 判断是否是高级订阅
		if (config.advancedSub) {
			// logger
			this.logger.info(
				"主人～女仆正在开启高级订阅呢，请稍等一下，女仆乖乖加载订阅中哦 (>///<)♡",
			);
			// 触发准备就绪事件
			this.ctx.emit("bilibili-notify/ready-to-recive");
		} else {
			// 从配置获取订阅
			if (config.subs && config.subs.length > 0) {
				// 转化订阅
				const subs = this.configSubsToSubscription(config.subs);
				// 加载后续部分
				await this.initAsyncPart(subs);
			} else
				this.logger.info(
					"主人～女仆初始化完毕啦，但发现还没有添加任何订阅呢 (>_<) 请快点添加，让女仆可以开始努力工作呀♡",
				);
		}
	}

	preInitConfig(subs: Subscriptions) {
		// 遍历subs
		for (const sub of Object.values(subs)) {
			// 判断是否个性化推送消息
			if (sub.customLiveMsg.enable) {
				if (!sub.customLiveMsg.customLiveStart.trim()) {
					sub.customLiveMsg.customLiveStart = this.config.customLiveStart;
				}
				if (!sub.customLiveMsg.customLiveEnd.trim()) {
					sub.customLiveMsg.customLiveEnd = this.config.customLiveEnd;
				}
				if (!sub.customLiveMsg.customLive.trim()) {
					sub.customLiveMsg.customLive = this.config.customLive;
				}
			} else {
				sub.customLiveMsg.enable = false;
				sub.customLiveMsg.customLiveStart = this.config.customLiveStart;
				sub.customLiveMsg.customLiveEnd = this.config.customLiveEnd;
				sub.customLiveMsg.customLive = this.config.customLive;
			}
			// 判断是否个性化舰长图片推送
			if (sub.customGuardBuy.enable) {
				if (!sub.customGuardBuy.guardBuyMsg.trim()) {
					sub.customGuardBuy.guardBuyMsg =
						this.config.customGuardBuy.guardBuyMsg;
				}
				if (!sub.customGuardBuy.captainImgUrl.trim()) {
					sub.customGuardBuy.captainImgUrl =
						this.config.customGuardBuy.captainImgUrl;
				}
				if (!sub.customGuardBuy.supervisorImgUrl.trim()) {
					sub.customGuardBuy.supervisorImgUrl =
						this.config.customGuardBuy.supervisorImgUrl;
				}
				if (!sub.customGuardBuy.governorImgUrl.trim()) {
					sub.customGuardBuy.governorImgUrl =
						this.config.customGuardBuy.governorImgUrl;
				}
			} else {
				if (this.config.customGuardBuy.enable) {
					sub.customGuardBuy.enable = true;
					sub.customGuardBuy.guardBuyMsg =
						this.config.customGuardBuy.guardBuyMsg;
					sub.customGuardBuy.captainImgUrl =
						this.config.customGuardBuy.captainImgUrl;
					sub.customGuardBuy.supervisorImgUrl =
						this.config.customGuardBuy.supervisorImgUrl;
					sub.customGuardBuy.governorImgUrl =
						this.config.customGuardBuy.governorImgUrl;
				}
			}
			// 判断是否个性化直播总结
			if (sub.customLiveSummary.enable) {
				if (sub.customLiveSummary.liveSummary.length === 0) {
					sub.customLiveSummary.liveSummary =
						this.config.liveSummary.join("\n");
				}
			} else {
				sub.customLiveSummary.enable = false;
				sub.customLiveSummary.liveSummary = this.config.liveSummary.join("\n");
			}

			// PushRecord part

			// 定义数组
			const dynamicArr: Array<string> = [];
			const dynamicAtAllArr: Array<string> = [];
			const liveArr: Array<string> = [];
			const liveAtAllArr: Array<string> = [];
			const liveGuardBuyArr: Array<string> = [];
			const superchatArr: Array<string> = [];
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
						["superchat", superchatArr],
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
				superchatArr,
				wordcloudArr,
			});
		}
		// logger
		this.logger.info(
			"主人～女仆正在初始化推送群组/频道信息呢，请稍等一下哦 (>ω<)♡",
		);
		this.logger.info(this.pushArrMap);
	}

	registeringForEvents() {
		// 监听登录事件
		this.ctx.console.addListener("bilibili-notify/start-login", async () => {
			this.logger.info("主人～女仆正在触发登录事件呢，请稍等一下哦 (>ω<)♡");
			// 获取二维码
			// biome-ignore lint/suspicious/noExplicitAny: <any>
			let content: any;
			try {
				content = await this.ctx["bilibili-notify-api"].getLoginQRCode();
			} catch (_) {
				this.logger.error(
					"主人呜呜 (；>_<) 女仆在请求 bili login getLoginQRCode() 的时候网络失败啦，请检查网络后再试呀 (>ω<)♡",
				);
				return;
			}
			// 判断是否出问题
			if (content.code !== 0)
				return this.ctx.emit("bilibili-notify/login-status-report", {
					status: BiliLoginStatus.LOGIN_FAILED,
					msg: `主人…呜呜 (；>_<) 女仆获取二维码失败啦，请主人再试一次哦 (>ω<)♡`,
				});
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
					if (err) {
						this.logger.error(
							`主人呜呜 (；>_<) 女仆生成二维码失败啦～错误信息：${err}，请主人帮女仆看看问题呀 (>ω<)♡`,
						);
						return this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGIN_FAILED,
							msg: "主人呜呜 (；>_<) 女仆生成二维码失败啦～",
						});
					}
					// 转换为base64
					const base64 = Buffer.from(buffer).toString("base64");
					const url = `data:image/png;base64,${base64}`;
					// 发送二维码
					this.ctx.emit("bilibili-notify/login-status-report", {
						status: BiliLoginStatus.LOGIN_QR,
						msg: "",
						data: url,
					});
				},
			);
			// 检查之前是否存在登录定时器
			if (this.loginTimer) this.loginTimer();
			// 设置flag
			let flag = true;
			// 发起登录请求检查登录状态
			this.loginTimer = this.ctx.setInterval(async () => {
				try {
					// 判断上一个循环是否完成
					if (!flag) return;
					flag = false;
					// 获取登录信息
					// biome-ignore lint/suspicious/noExplicitAny: <any>
					let loginContent: any;
					try {
						loginContent = await this.ctx["bilibili-notify-api"].getLoginStatus(
							content.data.qrcode_key,
						);
					} catch (e) {
						this.logger.error(
							`主人…呜呜 (；>_<) 女仆获取登录信息失败啦～错误信息：${e}，请主人帮女仆检查一下呀 (>ω<)♡`,
						);
						return;
					}
					if (loginContent.data.code === 86101) {
						return this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGGING_QR,
							msg: "主人～呜呜 (；>_<) 女仆发现您还没有扫码呢，请主人快点扫码呀 (>ω<)♡",
						});
					}
					if (loginContent.data.code === 86090) {
						return this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGGING_QR,
							msg: "主人～呜呜 (；>_<) 女仆看到二维码已经扫码了，但还没有确认呢，请主人快点确认呀 (>ω<)♡",
						});
					}
					if (loginContent.data.code === 86038) {
						this.loginTimer();
						return this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGIN_FAILED,
							msg: "主人呜呜 (；>_<) 女仆发现二维码已经失效啦，请主人重新登录好让女仆继续工作呀 (>ω<)♡",
						});
					}
					if (loginContent.data.code === 0) {
						// 登录成功
						const encryptedCookies = this.ctx["bilibili-notify-api"].encrypt(
							this.ctx["bilibili-notify-api"].getCookies(),
						);
						const encryptedRefreshToken = this.ctx[
							"bilibili-notify-api"
						].encrypt(loginContent.data.refresh_token);
						await this.ctx.database.upsert("loginBili", [
							{
								id: 1,
								bili_cookies: encryptedCookies,
								bili_refresh_token: encryptedRefreshToken,
							},
						]);
						// 检查登录数据库是否有数据
						this.loginDBData = (await this.ctx.database.get("loginBili", 1))[0];
						// ba重新加载登录信息
						await this.ctx["bilibili-notify-api"].loadCookiesFromDatabase();
						// 判断登录信息是否已加载完毕
						await this.checkIfLoginInfoIsLoaded();
						// 销毁定时器
						this.loginTimer();
						// 清除控制台通知
						this.ctx["bilibili-notify-api"].disposeNotifier();
						// 发送登录成功通知
						this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGIN_SUCCESS,
							msg: "主人～女仆看到您已登录啦，请点击按钮重启插件哦～女仆也会在5秒后自动帮您重启的 (>ω<)♡",
						});
						// 重启插件
						await this.ctx["bilibili-notify"].restartPlugin();
					}
					if (loginContent.code !== 0) {
						this.loginTimer();
						// 登录失败请重试
						return this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGIN_FAILED,
							msg: "主人呜呜 (；>_<) 女仆登录失败啦，请主人再试一次，好让女仆继续工作呀 (>ω<)♡",
						});
					}
				} finally {
					flag = true;
				}
			}, 1000);
		});
		// 监听插件重启事件
		this.ctx.console.addListener("bilibili-notify/restart-plugin", async () => {
			await this.ctx["bilibili-notify"].restartPlugin();
		});
		// 监听CORS请求事件
		this.ctx.console.addListener(
			"bilibili-notify/request-cors",
			async (url) => {
				const res = await fetch(url);
				const buffer = await res.arrayBuffer();
				const base64 = Buffer.from(buffer).toString("base64");
				return `data:image/png;base64,${base64}`;
			},
		);
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
		// 如果开启高级订阅才监听bilibili-notify事件
		if (this.config.advancedSub) {
			this.ctx.on(
				"bilibili-notify/advanced-sub",
				async (subs: Subscriptions) => {
					if (Object.keys(subs).length === 0) {
						// logger
						this.logger.info(
							"主人～女仆初始化完毕啦，但发现还没有添加任何订阅呢 (>_<) 请快点添加，让女仆可以开始努力工作呀♡",
						);
						// 返回
						return;
					}
					// 判断是否超过一次接收
					if (this.reciveSubTimes >= 1)
						await this.ctx["bilibili-notify"].restartPlugin();
					// 初始化后续部分
					else {
						// 处理uname
						this.processUname(subs);
						// 加载后续部分
						await this.initAsyncPart(subs);
					}
					// +1
					this.reciveSubTimes++;
				},
			);
		}
	}

	processUname(subs: Subscriptions) {
		// 处理uname
		for (const uname of Object.keys(subs)) {
			subs[uname].uname = uname;
		}
	}

	async initAsyncPart(subs: Subscriptions) {
		// 先清理一次直播监听
		this.ctx["bilibili-notify-live"].clearListeners();
		// logger
		this.logger.info(
			"主人～女仆已经获取到订阅信息啦，正在乖乖开始加载订阅中哦 (>ω<)♡",
		);
		// 判断订阅分组是否存在
		const groupInfoResult = await this.getGroupInfo();
		// 判断是否获取成功
		if (groupInfoResult.code !== 0) {
			this.logger.error(
				"主人呜呜 (；>_<) 女仆获取分组信息失败啦，插件初始化失败…请主人帮女仆看看问题呀 (>ω<)♡",
			);
			return;
		}
		// 赋值给成员变量
		this.groupInfo = groupInfoResult.data;
		// 加载订阅
		const { code, message } = await this.loadSubFromConfig(subs);
		// 判断是否加载成功
		if (code !== 0) {
			// logger
			this.logger.error(
				`主人呜呜 (；>_<) 女仆加载订阅对象失败啦，插件初始化失败～错误信息：${message}，请主人帮女仆看看呀 (>ω<)♡`,
			);
			// 发送私聊消息
			await this.sendPrivateMsg(
				"主人呜呜 (；>_<) 女仆加载订阅对象失败啦，插件初始化失败～",
			);
			// 返回
			return;
		}
		// 初始化管理器
		this.initManagerAfterLoadSub();
		// 检查是否需要动态监测
		this.checkIfDynamicDetectIsNeeded();
		// 在控制台中显示订阅对象
		this.updateSubNotifier();
		// 初始化完毕
		this.logger.info("主人～女仆插件初始化完毕啦！乖乖准备好为您服务哦 (>ω<)♡");
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

	initManagerAfterLoadSub() {
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
				superchat: s.superchat,
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
				liveEnd: true,
				target,
				customCardStyle: { enable: false },
				customLiveMsg: { enable: false },
				customLiveSummary: { enable: false },
				customGuardBuy: { enable: false },
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
					`主人～呜呜 (；>_<) 女仆发现 ${this.privateBot.platform} 机器人还没初始化完毕呢，暂时不能进行推送～女仆会乖乖等它准备好 (>ω<)♡`,
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
				"主人呜呜 (；>_<) 女仆已经重启插件三次啦，请主人检查一下机器人状态，然后输入指令 `bn start` 来启动插件哦 (>ω<)♡",
			);
			// 重启失败，发送消息
			await this.sendPrivateMsg(
				"主人呜呜 (；>_<) 女仆已经重启插件三次啦，请主人检查一下机器人状态，然后输入指令 `bn start` 来启动插件哦 (>ω<)♡",
			);
			// 关闭插件
			await this.ctx["bilibili-notify"].disposePlugin();
			// 结束
			return;
		}
		// 重启次数+1
		this.rebootCount++;
		// logger
		this.logger.info(
			"主人呜呜 (；>_<) 女仆发现插件出现未知错误啦，正在乖乖重启插件中～请主人稍等哦 (>ω<)♡",
		);
		// 重启插件
		const flag = await this.ctx["bilibili-notify"].restartPlugin();
		// 判断是否重启成功
		if (flag) {
			this.logger.info(
				"主人～女仆成功重启插件啦！乖乖准备继续为您服务哦 (>ω<)♡",
			);
		} else {
			// logger
			this.logger.error(
				"主人呜呜 (；>_<) 女仆重启插件失败啦，请主人检查机器人状态，然后输入指令 `bn start` 来启动插件哦 (>ω<)♡",
			);
			// 重启失败，发送消息
			await this.sendPrivateMsg(
				"主人呜呜 (；>_<) 女仆重启插件失败啦，请主人检查机器人状态，然后输入指令 `bn start` 来启动插件哦 (>ω<)♡",
			);
			// 关闭插件
			await this.ctx["bilibili-notify"].disposePlugin();
		}
	}

	async sendPrivateMsgAndStopService() {
		// 发送消息
		await this.sendPrivateMsg(
			"主人呜呜 (；>_<) 女仆发现插件发生未知错误啦，请主人检查机器人状态，然后输入指令 `bn start` 来启动插件哦 (>ω<)♡",
		);
		// logger
		this.logger.error(
			"主人呜呜 (；>_<) 女仆发现插件发生未知错误啦，请主人检查机器人状态，然后输入指令 `bn start` 来启动插件哦 (>ω<)♡",
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
					`主人呜呜 (；>_<) 女仆发送群组ID: ${channelId} 的消息失败啦～原因：${e.message}，请主人帮女仆看看呀 (>ω<)♡`,
				);
				await this.sendPrivateMsg(
					`主人呜呜 (；>_<) 女仆发送群组ID: ${channelId} 的消息失败啦～请主人帮女仆看看呀 (>ω<)♡`,
				);
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
					this.logger.warn(
						`主人呜呜 (；>_<) 女仆发现 ${platform} 没有配置对应机器人呢，暂时无法进行推送哦 (>ω<)♡`,
					);
					return;
				}
				// 判断机器人状态
				if (bots[botIndex].status !== Universal.Status.ONLINE) {
					// 判断是否超过5次重试
					if (retry >= 3000 * 2 ** 5) {
						// logger
						this.logger.error(
							`主人呜呜 (；>_<) 女仆发现 ${platform} 机器人还没初始化完毕呢～已经重试5次啦，暂时放弃推送了 (>ω<)♡`,
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							`主人呜呜 (；>_<) 女仆发现 ${platform} 机器人还没初始化完毕呢～已经重试5次啦，暂时放弃推送了 (>ω<)♡`,
						);
						// 返回
						return;
					}
					// 有机器人未准备好，直接返回
					this.logger.error(
						`主人～女仆发现 ${platform} 机器人还没初始化完毕呢，暂时无法推送～${retry / 1000} 秒后女仆会再试一次哦 (>ω<)♡`,
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
					this.logger.error(
						`主人呜呜 (；>_<) 女仆遇到错误啦～错误信息：${e}，请主人帮女仆看看呀 (>ω<)♡`,
					);
					// 判断是否还有其他机器人
					if (bots.length > 1) await sendMessageByBot(channelId, botIndex++);
				}
			};
			// 发送消息
			for (const channelId of t[platform]) {
				await sendMessageByBot(channelId);
			}
			// logger
			this.logger.info(
				`主人～女仆成功推送了 ${num} 条消息啦！乖乖完成任务～(>ω<)♡`,
			);
		}
	}

	async broadcastToTargets(
		uid: string,
		// biome-ignore lint/suspicious/noExplicitAny: <any>
		content: any,
		type: PushType,
	) {
		const record = this.pushArrMap.get(uid);
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
		this.logger.info(
			`主人～女仆这次要推送的对象是 ${uid}，推送类型是 ${PushTypeMsg[type]} 哦～乖乖完成任务啦 (>ω<)♡`,
		);

		// 推送 @全体（开播）
		if (
			type === PushType.StartBroadcasting &&
			record.liveAtAllArr?.length > 0
		) {
			this.logger.info(
				`主人～女仆推送给 @全体 的消息啦～对象列表：${record.liveAtAllArr} 哦 (>ω<)♡`,
			);
			const atAllArr = structuredClone(record.liveAtAllArr);
			await withRetry(() => this.pushMessage(atAllArr, h.at("all")), 1);
		}

		// 推送动态
		if (type === PushType.Dynamic && record.dynamicArr?.length > 0) {
			if (record.dynamicAtAllArr?.length > 0) {
				this.logger.info(
					`主人～女仆推送动态给 @全体 哦～对象列表：${record.dynamicAtAllArr} (>ω<)♡`,
				);
				const dynamicAtAllArr = structuredClone(record.dynamicAtAllArr);
				await withRetry(
					() => this.pushMessage(dynamicAtAllArr, h.at("all")),
					1,
				);
			}
			this.logger.info(
				`主人～女仆正在推送动态啦～对象列表：${record.dynamicArr} (>ω<)♡`,
			);
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
			this.logger.info(
				`主人～女仆正在推送直播啦～对象列表：${record.liveArr} (>ω<)♡`,
			);
			const liveArr = structuredClone(record.liveArr);
			await withRetry(
				() => this.pushMessage(liveArr, h("message", content)),
				1,
			);
		}

		// 推送直播守护购买
		if (type === PushType.LiveGuardBuy && record.liveGuardBuyArr?.length > 0) {
			this.logger.info(
				`主人～女仆正在推送直播守护购买消息啦～对象列表：${record.liveGuardBuyArr} (>ω<)♡`,
			);
			const liveGuardBuyArr = structuredClone(record.liveGuardBuyArr);
			await withRetry(
				() => this.pushMessage(liveGuardBuyArr, h("message", content)),
				1,
			);
		}

		// 推送SC
		if (type === PushType.Superchat && record.superchatArr?.length > 0) {
			this.logger.info(
				`主人～女仆正在推送 SC 消息啦～对象列表：${record.superchatArr} (>ω<)♡`,
			);
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
				this.logger.info(
					`主人～女仆正在推送词云和直播总结啦～对象列表：${wordcloudAndLiveSummaryArr} (>ω<)♡`,
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
				this.logger.info(
					`主人～女仆正在推送词云啦～对象列表：${wordcloudOnlyArr} (>ω<)♡`,
				);
				await withRetry(
					() => this.pushMessage(wordcloudOnlyArr, h("message", content[0])),
					1,
				);
			}

			if (content[1] && liveSummaryOnlyArr.length > 0) {
				this.logger.info(
					`主人～女仆正在推送直播总结啦～对象列表：${liveSummaryOnlyArr} (>ω<)♡`,
				);
				await withRetry(
					() => this.pushMessage(liveSummaryOnlyArr, h("message", content[1])),
					1,
				);
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
					`主人呜呜 (；>_<) 女仆在执行 dynamicDetect getAllDynamic() 时发生了错误～错误信息：${e.message}，请主人帮女仆看看呀 (>ω<)♡`,
				);
			});
			// content不存在则直接返回
			if (!content) return;
			// 判断获取动态内容是否成功
			if (content.code !== 0) {
				switch (content.code) {
					case -101: {
						// 账号未登录
						this.logger.error(
							"主人…呜呜，女仆发现您还没登录账号呢 (；>_<)插件已经乖乖停止工作啦…请主人快点登录，让女仆可以继续努力为您服务～ (>ω<)♡",
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							"主人…呜呜，女仆发现您还没登录账号呢 (；>_<)插件已经乖乖停止工作啦…请主人快点登录，让女仆可以继续努力为您服务～ (>ω<)♡",
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
					case -352: {
						// 风控
						this.logger.error(
							"主人…呜呜 (；>_<) 女仆发现账号被风控啦～插件已经乖乖停止工作了…请主人输入指令 bili cap，然后按照提示来解除风控吧～女仆会在旁边乖乖等您完成的 (>ω<)♡",
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							"主人…呜呜 (；>_<) 女仆发现账号被风控啦～插件已经乖乖停止工作了…请主人输入指令 bili cap，然后按照提示来解除风控吧～女仆会在旁边乖乖等您完成的 (>ω<)♡",
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
					default: {
						// 未知错误
						this.logger.error(
							`主人…呜呜 (；>_<) 女仆在获取动态信息时遇到问题啦～错误码：${content.code}，错误信息：${content.message}，请主人排除问题后输入指令 \`bn start\` 重启插件～女仆会乖乖等着的 (>ω<)♡`,
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							`主人…呜呜 (；>_<) 女仆在获取动态信息时遇到问题啦～错误码：${content.code}，错误信息：${content.message}，请主人排除问题后输入指令 \`bn start\` 重启插件～女仆会乖乖等着的 (>ω<)♡`,
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
								`主人呜呜 (；>_<) 女仆在执行 dynamicDetect generateDynamicImg() 时推送卡片发送失败啦～原因：${e.message}，请主人帮女仆看看呀 (>ω<)♡`,
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
						let aigc = "";
						// 判断是否需要发送AI播报
						if (this.config.ai.enable) {
							// logger
							this.logger.info(
								"主人～女仆正在努力生成 AI 动态推送内容中呢…请稍等一下呀 (>ω<)♡",
							);
							// 收集信息
							if (item.type === "DYNAMIC_TYPE_AV") {
								// 视频动态
								const title = item.modules.module_dynamic.major.archive.title;
								const desc = item.modules.module_dynamic.major.archive.desc;
								// 发送AI播报
								const res = await this.ctx["bilibili-notify-api"].chatWithAI(
									`请你根据以下视频标题和简介，帮我写一份简短的动态播报，标题：${title}，简介：${desc}`,
								);
								// 获取AI播报内容
								aigc = res.choices[0].message.content;
							}
							if (
								item.type === "DYNAMIC_TYPE_DRAW" ||
								item.type === "DYNAMIC_TYPE_WORD"
							) {
								// 图文动态
								const title = item.modules.module_dynamic.major.opus.title;
								const desc =
									item.modules.module_dynamic.major.opus.summary.text;
								// 发送AI播报
								const res = await this.ctx["bilibili-notify-api"].chatWithAI(
									`请你根据以下图文动态的标题和内容，帮我写一份简短的动态播报，标题：${title}，内容：${desc}`,
								);
								// 获取AI播报内容
								aigc = res.choices[0].message.content;
							}
							// logger
							this.logger.info(
								`主人～女仆的 AI 动态推送内容生成完毕啦！乖乖准备好发送给大家哦 (>ω<)♡`,
							);
						}
						// logger
						this.logger.info(`主人～女仆正在推送动态中呢…请稍等哦 (>ω<)♡`);
						// 发送推送卡片
						await this.broadcastToTargets(
							uid,
							h("message", [
								h.image(buffer, "image/jpeg"),
								h.text(aigc),
								h.text(dUrl),
							]),
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
						this.logger.info(
							`主人～女仆的动态推送完毕啦！乖乖完成任务～(>ω<)♡`,
						);
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
			this.logger.info(`主人～女仆正在开始获取动态信息呢…请稍等一下呀 (>ω<)♡`);
			// 使用withRetry函数进行重试
			const content = await withRetry(async () => {
				// 获取动态内容
				return (await this.ctx[
					"bilibili-notify-api"
				].getAllDynamic()) as AllDynamicInfo;
			}, 1).catch((e) => {
				// logger
				this.logger.error(
					`主人呜呜 (；>_<) 女仆在执行 dynamicDetect getAllDynamic() 时遇到错误啦～错误信息：${e.message}，请主人帮女仆看看呀 (>ω<)♡`,
				);
			});
			// content不存在则直接返回
			if (!content) return;
			// 判断获取动态内容是否成功
			if (content.code !== 0) {
				switch (content.code) {
					case -101: {
						// 账号未登录
						this.logger.error(
							`主人呜呜 (；>_<) 女仆发现账号还没登录呢，插件已经停止工作啦～请主人快点登录好让女仆继续努力呀 (>ω<)♡`,
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							`主人呜呜 (；>_<) 女仆发现账号还没登录呢，插件已经停止工作啦～请主人快点登录好让女仆继续努力呀 (>ω<)♡`,
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
					case -352: {
						// 风控
						// 输出日志
						this.logger.error(
							"主人呜呜 (；>_<) 女仆发现账号被风控啦，插件已经停止工作～请主人输入指令 `bili cap` 并根据提示解除风控呀～女仆会乖乖等您完成的 (>ω<)♡",
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							"主人呜呜 (；>_<) 女仆发现账号被风控啦，插件已经停止工作～请主人输入指令 `bili cap` 并根据提示解除风控呀～女仆会乖乖等您完成的 (>ω<)♡",
						);
						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
					default: {
						// 未知错误
						this.logger.error(
							`主人呜呜 (；>_<) 女仆在获取动态信息时遇到问题啦～错误码：${content.code}，错误信息：${content.message}，请主人排除问题后输入指令 \`bn start\` 重启插件呀～女仆会乖乖等着的 (>ω<)♡`,
						);
						// 发送私聊消息
						await this.sendPrivateMsg(
							`主人呜呜 (；>_<) 女仆在获取动态信息时遇到问题啦～错误码：${content.code}，错误信息：${content.message}，请主人排除问题后输入指令 \`bn start\` 重启插件呀～女仆会乖乖等着的 (>ω<)♡`,
						);

						// 停止服务
						await this.ctx["bilibili-notify"].disposePlugin();
						// 结束循环
						break;
					}
				}
			}
			// logger
			this.logger.info(
				"主人～女仆成功获取动态信息啦！正在乖乖开始处理动态信息呢 (>ω<)♡",
			);
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
					`主人主人～女仆已经成功拿到动态信息啦！UP主是：${name}，UID：${uid}，动态发布时间是：${DateTime.fromSeconds(postTime).toFormat("yyyy-MM-dd HH:mm:ss")} 哦～女仆超乖地汇报给您呢 (>ω<)♡`,
				);
				// 判断是否存在时间线
				if (this.dynamicTimelineManager.has(uid)) {
					// logger
					this.logger.info(
						"主人订阅订阅了这位UP主啦…女仆正在努力检查动态时间线呢 (＞▽＜)ゞ♡",
					);
					// 寻找关注的UP主
					const timeline = this.dynamicTimelineManager.get(uid);
					// logger
					this.logger.info(
						`主人主人～女仆找到了上次的推送时间线哟：${DateTime.fromSeconds(timeline).toFormat("yyyy-MM-dd HH:mm:ss")} ～请您看看是不是对的呢 (〃･ω･〃)♡`,
					);
					// 判断动态发布时间是否大于时间线
					if (timeline < postTime) {
						// logger
						this.logger.info(
							"主人～这条动态需要推送哟！女仆已经开始乖乖进行推送啦 (๑•̀ω•́๑)✧♡",
						);
						// 获取订阅对象
						const sub = this.subManager.get(uid);
						// logger
						this.logger.info(
							"主人～女仆正在努力开始渲染推送卡片呢～请稍等一下呀 (〃ﾉωﾉ)♡",
						);
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
								`主人呜呜 (；>_<) 女仆在执行 dynamicDetect generateDynamicImg() 时推送卡片发送失败啦～原因：${e.message}，请主人帮女仆看看呀 (>ω<)♡`,
							);
							// 发送私聊消息并重启服务
							await this.sendPrivateMsgAndStopService();
						});
						// 判断是否执行成功，未执行成功直接返回
						if (!buffer) continue;
						// logger
						this.logger.info(
							"主人～女仆渲染推送卡片成功啦！乖乖准备好发送啦 (>ω<)♡",
						);
						// 定义动态链接
						let dUrl = "";
						// 判断是否需要发送URL
						if (this.config.dynamicUrl) {
							// logger
							this.logger.info(
								"主人～女仆发现需要发送动态链接啦，正在努力生成链接中呢 (>ω<)♡",
							);
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
							this.logger.info(
								"主人～女仆成功生成动态链接啦！准备好发送给大家啦 (>ω<)♡",
							);
						}
						// logger
						this.logger.info("主人～女仆正在推送动态中呢…请稍等哦 (>ω<)♡");
						// 发送推送卡片
						await this.broadcastToTargets(
							uid,
							h("message", [h.image(buffer, "image/jpeg"), h.text(dUrl)]),
							PushType.Dynamic,
						);
						// 判断是否需要发送动态中的图片
						if (this.config.pushImgsInDynamic) {
							// logger
							this.logger.info(
								"主人～女仆发现动态里有图片要发送哦，正在努力发送中呢 (>ω<)♡",
							);
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
							this.logger.info(
								"主人～女仆已经把动态中的图片发送完毕啦！乖乖完成任务啦 (>ω<)♡",
							);
						}
						// 如果当前订阅对象已存在更早推送，则无需再更新时间线
						if (!currentPushDyn[uid]) {
							// 将当前动态存入currentPushDyn
							currentPushDyn[uid] = item;
						}
						// logger
						this.logger.info(
							"主人～女仆的动态推送完毕啦！乖乖完成任务～(>ω<)♡",
						);
					}
				}
			}
			// logger
			this.logger.info(
				"主人～女仆已经把动态信息处理完毕啦！一切都乖乖完成啦 (>ω<)♡",
			);
			// 遍历currentPushDyn
			for (const uid in currentPushDyn) {
				// 获取动态发布时间
				const postTime = currentPushDyn[uid].modules.module_author.pub_ts;
				// 更新当前时间线
				this.dynamicTimelineManager.set(uid, postTime);
				// logger
				this.logger.info(
					`主人～女仆成功更新了时间线啦！UP主：${uid}，时间线：${DateTime.fromSeconds(postTime).toFormat("yyyy-MM-dd HH:mm:ss")} 哦～女仆超乖地汇报给您呢 (>ω<)♡`,
				);
			}
			// logger
			this.logger.info(
				`主人～女仆这次要推送的动态数量是：${Object.keys(currentPushDyn).length} 条哦～乖乖完成任务啦 (>ω<)♡`,
			);
		};
		// 返回一个闭包函数
		return withLock(handler);
	}

	async getMasterInfo(
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

	async getLiveRoomInfo(roomId: string): Promise<LiveRoomInfo["data"]> {
		// 发送请求获取直播间信息
		const data = await withRetry(
			async () => await this.ctx["bilibili-notify-api"].getLiveRoomInfo(roomId),
		)
			.then((content) => content.data)
			.catch((e) => {
				this.logger.error(
					`主人呜呜 (；>_<) 女仆在执行 liveDetect getLiveRoomInfo 时遇到错误啦～错误信息：${e.message}，请主人帮女仆看看呀 (>ω<)♡`,
				);
			});
		// 发送私聊消息并重启服务
		if (!data) {
			await this.sendPrivateMsgAndStopService();
			return;
		}
		// 返回
		return data;
	}

	async sendLiveNotifyCard(
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
			this.logger.error(
				`主人呜呜 (；>_<) 女仆在执行 liveDetect generateLiveImg() 时推送卡片生成失败啦～原因：${e.message}，请主人帮女仆看看呀 (>ω<)♡`,
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
			.forEach((w) => {
				danmakuWeightRecord[w] = (danmakuWeightRecord[w] || 0) + 1;
			});
	}

	addUserToDanmakuMaker(
		username: string,
		danmakuMakerRecord: Record<string, number>,
	) {
		danmakuMakerRecord[username] = (danmakuMakerRecord[username] || 0) + 1;
	}

	// 舰长图片
	static GUARD_LEVEL_IMG = {
		[GuardLevel.Jianzhang]:
			"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/captain-Bjw5Byb5.png",
		[GuardLevel.Tidu]:
			"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/supervisor-u43ElIjU.png",
		[GuardLevel.Zongdu]:
			"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/governor-DpDXKEdA.png",
	};

	async liveDetectWithListener(sub: Subscription) {
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
			this.logger.info(
				"主人～女仆正在开始制作弹幕词云呢～请稍等一下呀 (〃ﾉωﾉ)♡",
			);
			this.logger.info("主人～女仆正在努力获取前90热词呢～请稍等哦 (>ω<)♡");
			// 获取数据
			const words = Object.entries(danmakuWeightRecord);
			const danmaker = Object.entries(danmakuSenderRecord);
			// 获取img
			const img = await (async () => {
				// 判断是否不足50词
				if (words.length < 50) {
					// logger
					this.logger.info(
						"主人呜呜 (；>_<) 女仆发现热词不足50个呢，本次弹幕词云只好放弃啦 (>ω<)♡",
					);
					// 返回
					return;
				}
				// 拿到前90个热词
				const top90Words = words.sort((a, b) => b[1] - a[1]).slice(0, 90);
				this.logger.info(
					"主人～女仆整理好了弹幕词云前90词及权重啦～请主人过目哦 (>ω<)♡",
				);
				this.logger.info(top90Words);
				this.logger.info(
					"主人～女仆正在准备生成弹幕词云呢～请稍等一下呀 (>ω<)♡",
				);
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
					this.logger.info(
						"主人呜呜 (；>_<) 女仆发现发言人数不足5位呢，本次弹幕词云只好放弃啦 (>ω<)♡",
					);
					// 返回
					return;
				}
				// logger
				this.logger.info(
					"主人～女仆正在开始构建弹幕发送排行榜消息呢～请稍等呀 (>ω<)♡",
				);
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
					this.logger.info(
						"主人～女仆发现 AI 直播总结功能已开启啦，正在努力生成 AI 直播总结呢 (>ω<)♡",
					);
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
					this.logger.info(
						"主人～女仆生成好了 AI 直播总结啦，请主人过目哦 (>ω<)♡",
					);
					this.logger.info(res.choices[0].message.content);
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
			// 发送消息
			await this.broadcastToTargets(
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
				!(await useLiveRoomInfo(LiveType.LiveBroadcast)) &&
				!(await useMasterInfo(LiveType.LiveBroadcast))
			) {
				// 未获取成功，直接返回
				await this.sendPrivateMsg(
					"主人呜呜 (；>_<) 女仆获取直播间信息失败啦，推送直播卡片也失败了～请主人帮女仆看看呀 (>ω<)♡",
				);
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
					"主人～女仆发现直播间已下播啦！可能与直播间的连接断开了，请主人使用指令 `bn restart` 重启插件呀 (>ω<)♡",
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
				return;
			}
			// 不更新开播时间
			liveRoomInfo = replaceButKeep(liveRoomInfo, data, ["live_time"]);
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
				this.ctx["bilibili-notify-live"].closeListener(sub.roomid);
				await this.sendPrivateMsg(
					`主人呜呜 (；>_<) 女仆发现 [${sub.roomid}] 直播间连接发生错误啦，请主人帮女仆看看呀 (>ω<)♡`,
				);
				this.logger.error(
					`主人呜呜 (；>_<) 女仆发现 [${sub.roomid}] 直播间连接发生错误啦，请主人帮女仆看看呀 (>ω<)♡`,
				);
			},

			onIncomeDanmu: ({ body }) => {
				this.segmentDanmaku(body.content, danmakuWeightRecord);
				this.addUserToDanmakuMaker(body.user.uname, danmakuSenderRecord);
			},

			onIncomeSuperChat: ({ body }) => {
				this.segmentDanmaku(body.content, danmakuWeightRecord);
				this.addUserToDanmakuMaker(body.user.uname, danmakuSenderRecord);
				// 推送
				const content = h("message", [
					h.text(
						`【${masterInfo.username}的直播间】${body.user.uname}的SC：${body.content}（${body.price}元）`,
					),
				]);
				this.broadcastToTargets(sub.uid, content, PushType.Superchat);
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
							ComRegister.GUARD_LEVEL_IMG[body.guard_level];
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
							return this.broadcastToTargets(
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
						// 构建消息
						return h.image(buffer, "image/jpeg");
					}
				})();
				// 推送
				this.broadcastToTargets(sub.uid, msg, PushType.LiveGuardBuy);
			},

			onLiveStart: async () => {
				const now = Date.now();

				// 冷却期保护
				if (now - lastLiveStart < LIVE_EVENT_COOLDOWN) {
					this.logger.warn(
						`主人～女仆发现 [${sub.roomid}] 的开播事件在冷却期内，所以被忽略啦 (>ω<)♡`,
					);
					return;
				}

				lastLiveStart = now;

				// 状态守卫
				if (liveStatus) {
					this.logger.warn(
						`主人～女仆发现 [${sub.roomid}] 已经是开播状态啦，所以忽略了重复的开播事件哦 (>ω<)♡`,
					);
					return;
				}

				liveStatus = true;

				if (
					!(await useLiveRoomInfo(LiveType.StartBroadcasting)) &&
					!(await useMasterInfo(LiveType.StartBroadcasting))
				) {
					liveStatus = false;
					await this.sendPrivateMsg(
						"主人呜呜 (；>_<) 女仆获取直播间信息失败啦，推送直播开播卡片也失败了，请主人帮女仆看看呀 (>ω<)♡",
					);
					return await this.sendPrivateMsgAndStopService();
				}

				// fans number log
				this.logger.info(
					`主人～女仆查到房间号是：${masterInfo.roomId}，开播时的粉丝数有：${masterInfo.liveOpenFollowerNum} 哦～女仆乖乖汇报完毕 (>ω<)♡`,
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
				if (this.config.pushTime !== 0 && !pushAtTimeTimer) {
					pushAtTimeTimer = this.ctx.setInterval(
						pushAtTimeFunc,
						this.config.pushTime * 1000 * 60 * 60,
					);
					this.liveWSManager.set(sub.roomid, pushAtTimeTimer);
				}
			},

			onLiveEnd: async () => {
				const now = Date.now();

				// 冷却期保护
				if (now - lastLiveEnd < LIVE_EVENT_COOLDOWN) {
					this.logger.warn(
						`主人～女仆发现 [${sub.roomid}] 的下播事件在冷却期内，所以被忽略啦 (>ω<)♡`,
					);
					return;
				}

				lastLiveEnd = now;

				// 状态守卫
				if (!liveStatus) {
					this.logger.warn(
						`主人～女仆发现 [${sub.roomid}] 已经是下播状态啦，所以忽略了重复的下播事件哦 (>ω<)♡`,
					);
					return;
				}

				// 获取信息
				if (
					!(await useLiveRoomInfo(LiveType.StopBroadcast)) &&
					!(await useMasterInfo(LiveType.StopBroadcast))
				) {
					liveStatus = false;
					await this.sendPrivateMsg(
						"主人呜呜 (；>_<) 女仆获取直播间信息失败啦，推送直播开播卡片也失败了，请主人帮女仆看看呀 (>ω<)♡",
					);
					return await this.sendPrivateMsgAndStopService();
				}

				liveStatus = false;

				// fans number log
				this.logger.info(
					`主人～女仆报告开播时粉丝数：${masterInfo.liveOpenFollowerNum}，下播时粉丝数：${masterInfo.liveEndFollowerNum}，粉丝数变化：${masterInfo.liveFollowerChange} 哦～女仆乖乖汇报完毕 (>ω<)♡`,
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

				// 定时器安全关闭
				if (pushAtTimeTimer) {
					pushAtTimeTimer();
					pushAtTimeTimer = null;
					this.liveWSManager.delete(sub.roomid);
				}
			},
		};

		// 启动直播间弹幕监测
		await this.ctx["bilibili-notify-live"].startLiveRoomListener(
			sub.roomid,
			handler,
		);
		// 第一次启动获取信息并判信息是否获取成功
		if (
			!(await useLiveRoomInfo(LiveType.FirstLiveBroadcast)) &&
			!(await useMasterInfo(LiveType.FirstLiveBroadcast))
		) {
			// 未获取成功，直接返回
			return this.sendPrivateMsg(
				"主人呜呜 (；>_<) 女仆获取直播间信息失败啦，所以启动直播间弹幕检测也失败了，请主人帮女仆看看呀 (>ω<)♡",
			);
		}
		// fans number log
		this.logger.info(
			`主人～女仆查到当前粉丝数是：${masterInfo.liveOpenFollowerNum} 哦～乖乖报告完毕 (>ω<)♡`,
		);
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
				this.liveWSManager.set(sub.roomid, pushAtTimeTimer);
			}
			// 设置直播状态为true
			liveStatus = true;
		}
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

	async getGroupInfo(): Promise<Result> {
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
			return { code: 0, message: "主人～女仆发现这个分组已经存在啦 (>ω<)♡" };
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
				message: "主人～女仆获取分组明细成功啦～乖乖汇报完毕 (>ω<)♡",
				data: relationGroupDetailData.data,
			};
		};
		// 获取分组明细
		const { code, message, data } = await getGroupDetailData();
		// 判断获取分组明细是否成功
		if (code !== 0) {
			return { code, message };
		}
		return {
			code: 0,
			message: "主人～女仆获取分组明细成功啦～乖乖汇报完毕 (>ω<)♡",
			data,
		};
	}

	async subUserInBili(mid: string): Promise<Result> {
		// 判断是否已经订阅该对象
		for (const user of this.groupInfo) {
			if (user.mid.toString() === mid) {
				// 已关注订阅对象
				return {
					code: 0,
					message: "主人～女仆发现订阅对象已经在分组里啦 (>ω<)♡",
				};
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
					message:
						"主人呜呜 (；>_<) 女仆发现账号未登录哦～请主人使用指令 `bili login` 登录后再进行订阅操作呀 (>ω<)♡",
				};
			},
			[-102]: () => {
				return {
					code: subUserData.code,
					message:
						"主人呜呜 (；>_<) 女仆发现账号被封停啦，所以无法进行订阅操作呀 (>ω<)♡",
				};
			},
			22002: () => {
				return {
					code: subUserData.code,
					message:
						"主人呜呜 (；>_<) 女仆发现因为对方隐私设置，无法进行订阅操作呀 (>ω<)♡",
				};
			},
			22003: () => {
				return {
					code: subUserData.code,
					message:
						"主人呜呜 (；>_<) 女仆发现您已经把对方拉黑啦，所以无法进行订阅操作呀 (>ω<)♡",
				};
			},
			22013: () => {
				return {
					code: subUserData.code,
					message:
						"主人呜呜 (；>_<) 女仆发现账号已注销啦，所以无法进行订阅操作呀 (>ω<)♡",
				};
			},
			40061: () => {
				return {
					code: subUserData.code,
					message:
						"主人呜呜 (；>_<) 女仆发现账号不存在哦～请主人检查 UID 输入是否正确，或者用户是否真的存在呀 (>ω<)♡",
				};
			},
			22001: () => {
				return {
					code: 0,
					message:
						"主人～女仆发现订阅对象是主人自己呢～所以不用添加到分组啦 (>ω<)♡",
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
						message:
							"主人呜呜 (；>_<) 女仆尝试把订阅对象添加到分组失败啦～请主人稍后再试哦 (>ω<)♡",
					};
				}
				// 添加成功
				return {
					code: 0,
					message: "主人～女仆已经成功把订阅对象添加到分组啦 (>ω<)♡",
				};
			},
			// 账号异常
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
						message:
							"主人呜呜 (；>_<) 女仆尝试把订阅对象添加到分组失败啦～请主人稍后再试哦 (>ω<)♡",
					};
				}
				// 添加成功
				return {
					code: 0,
					message: "主人～女仆已经成功把订阅对象添加到分组啦 (>ω<)♡",
				};
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
			this.logger.info(
				`主人～女仆正在加载订阅 UID：${sub.uid} 中呢～请稍等呀 (>ω<)♡`,
			);
			// 在B站中订阅该对象
			const subInfo = await this.subUserInBili(sub.uid);
			// 判断订阅是否成功
			if (subInfo.code !== 0 && subInfo.code !== 22015) return subInfo;
			// 判断是否是账号异常
			if (subInfo.code === 22015) {
				// 账号异常
				this.logger.warn(
					`主人呜呜 (；>_<) 女仆发现账号异常，无法自动订阅 UID：${sub.uid} 哦～请主人手动订阅，然后把订阅移动到 "订阅" 分组里呀 (>ω<)♡`,
				);
			}
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
			// 判断是否有直播间号
			if (sub.live && !sub.roomid) {
				// logger
				this.logger.info(
					`主人～女仆发现 UID：${sub.uid} 请求了用户接口哦～女仆乖乖记录啦 (>ω<)♡`,
				);
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
						`主人呜呜 (；>_<) 女仆在执行 loadSubFromConfig() 的 getUserInfo() 时发生错误啦～错误信息：${e.message}，请主人帮女仆看看呀 (>ω<)♡`,
					);
					// 返回失败
					return {
						code: -1,
						message: `主人呜呜 (；>_<) 女仆加载订阅 UID：${sub.uid} 失败啦～请主人帮女仆看看呀 (>ω<)♡`,
					};
				});
				// v_voucher风控
				if (userInfoCode === -352 && userInfoData.v_voucher) {
					// logger
					this.logger.info(
						"主人呜呜 (；>_<) 女仆发现账号被风控啦～请主人使用指令 `bili cap` 进行风控验证呀 (>ω<)♡",
					);
					// 发送私聊消息
					await this.sendPrivateMsg(
						"主人呜呜 (；>_<) 女仆发现账号被风控啦～请主人使用指令 `bili cap` 进行风控验证呀 (>ω<)♡",
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
					this.logger.warn(
						`主人～女仆发现 UID：${sub.uid} 的用户没有开通直播间哦，所以无法订阅直播啦 (>ω<)♡`,
					);
				}
				// 将roomid设置进去
				sub.roomid = userInfoData.live_room?.roomid;
			}
			// 判断是否需要订阅直播
			if (sub.live && sub.roomid) {
				// 启动直播监测
				await this.liveDetectWithListener(sub);
			}
			// logger
			this.logger.info(
				`主人～女仆订阅 UID：${sub.uid} 已经加载完毕啦～乖乖完成任务啦 (>ω<)♡`,
			);
			// 判断是不是最后一个订阅
			if (sub !== Object.values(subs).pop()) {
				// 不是最后一个订阅，执行delay
				// 1-3秒随机延迟
				const randomDelay = Math.floor(Math.random() * 3) + 1;
				// logger
				this.logger.info(
					`主人～女仆设置了随机延迟哦～延迟时间：${randomDelay} 秒呢 (>ω<)♡`,
				);
				// delay
				await this.ctx.sleep(randomDelay * 1000);
			}
		}
		return {
			code: 0,
			message: "主人～女仆的订阅加载完毕啦！乖乖完成任务～(>ω<)♡",
		};
	}

	checkIfDynamicDetectIsNeeded() {
		// 检查是否有订阅对象需要动态监测
		if (this.dynamicTimelineManager.size > 0) {
			// 启动动态监测
			this.enableDynamicDetect();
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
		this.logger.info(
			"主人～女仆的动态监测已经开启啦～开始乖乖监控动态呢 (>ω<)♡",
		);
		// 开始动态监测
		this.dynamicJob.start();
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
			superchat: boolean;
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
		ai: {
			enable: boolean;
			apiKey: string;
			baseURL: string;
			model: string;
			persona: string;
		};
		customGuardBuy: {
			enable: boolean;
			captainImgUrl?: string;
			supervisorImgUrl?: string;
			governorImgUrl?: string;
			guardBuyMsg?: string;
		};
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
				superchat: Schema.boolean().default(false).description("SC"),
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
		ai: Schema.object({
			enable: Schema.boolean().default(false),
			apiKey: Schema.string().default(""),
			baseURL: Schema.string().default("https://api.siliconflow.cn/v1"),
			model: Schema.string().default("gpt-3.5-turbo"),
			persona: Schema.string(),
		}),
		customGuardBuy: Schema.object({
			enable: Schema.boolean()
				.default(false)
				.description("是否启用自定义舰长购买图片"),
			captainImgUrl: Schema.string().description("舰长图片链接"),
			supervisorImgUrl: Schema.string().description("提督图片链接"),
			governorImgUrl: Schema.string().description("总督图片链接"),
			guardBuyMsg: Schema.string().description("舰长购买消息"),
		}),
	});
}

export default ComRegister;
