// Koishi核心依赖
// biome-ignore lint/correctness/noUnusedImports: <import type>
import {} from "@koishijs/plugin-help";
import type { Notifier } from "@koishijs/plugin-notifier";
import {
	type Awaitable,
	type Context,
	type FlatPick,
	h,
	Schema,
	Service,
} from "koishi";
// 外部依赖
import QRCode from "qrcode";
// Command
import { biliCommands, statusCommands } from "../command";
import type { LoginBili } from "../database";
// Types
import {
	BiliLoginStatus,
	type Channel,
	type ChannelArr,
	type CreateGroup,
	type GroupList,
	type MySelfInfoData,
	type PushArrMap,
	type Result,
	type SubManager,
	type Subscriptions,
	type Target,
	type UserCardInfoData,
} from "../type";
// Utils
import { withRetry } from "../utils";

declare module "koishi" {
	interface Context {
		"bilibili-notify-sub": BilibiliNotifySub;
	}
}

class BilibiliNotifySub extends Service<BilibiliNotifySub.Config> {
	// 必须服务
	static inject = [
		"database",
		"bilibili-notify",
		"bilibili-notify-api",
		"bilibili-notify-push",
		"bilibili-notify-live",
		"bilibili-notify-dynamic",
		"bilibili-notify-generate-img",
	];
	// 登录定时器
	loginTimer: () => void;
	// 订阅通知
	subNotifier: Notifier;
	// 订阅管理器
	subManager: SubManager;
	// 检查登录数据库是否有数据
	loginDBData: FlatPick<LoginBili, "dynamic_group_id">;
	// recive subs times
	reciveSubTimes = 0;
	// biome-ignore lint/suspicious/noExplicitAny: <data>
	groupInfo: any | null = null;
	// 构造函数
	constructor(ctx: Context, config: BilibiliNotifySub.Config) {
		super(ctx, "bilibili-notify-sub");
		// 设置config
		this.config = config;
		// 设置日志等级
		this.logger.level = config.logLevel;
	}

	protected async start(): Promise<void> {
		// 注册指令
		this.registerCommands();
		// 注册事件
		this.registeringForEvents();
		// 检查登录数据库是否有数据
		this.loginDBData = (
			await this.ctx.database.get("loginBili", 1, ["dynamic_group_id"])
		)[0];
		// 判断登录信息是否已加载完毕
		await this.checkIfLoginInfoIsLoaded();
		// 如果未登录，则直接返回
		if (!(await this.checkIfIsLogin())) {
			// log
			this.logger.info("账号未登录，请先登录");
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
				msg: "账号已登录，但获取个人信息失败，请检查",
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
		// 初始化订阅管理器
		this.subManager = new Map();
		// 判断是否是高级订阅
		if (this.config.advancedSub) {
			// logger
			this.logger.info("开启高级订阅，正在加载订阅");
			// 触发准备就绪事件
			this.ctx.emit("bilibili-notify/ready-to-recive");
		} else {
			// 从配置获取订阅
			if (this.config.subs && this.config.subs.length > 0) {
				// 转化订阅
				const subs = this.configSubsToSubscription(this.config.subs);
				// 加载后续部分
				await this.initAsyncPart(subs);
			} else this.logger.info("初始化完毕，但未添加任何订阅");
		}
	}

	protected stop(): Awaitable<void> {
		// 销毁登录定时器
		if (this.loginTimer) this.loginTimer();
	}

	preInitConfig(subs: Subscriptions) {
		const pushArrMap: PushArrMap = new Map();
		// 遍历subs
		for (const sub of Object.values(subs)) {
			// 判断是否个性化推送消息
			if (sub.customLiveMsg.enable) {
				if (
					!sub.customLiveMsg.customLiveStart ||
					!sub.customLiveMsg.customLiveStart.trim()
				) {
					sub.customLiveMsg.customLiveStart = this.config.customLiveStart;
				}
				if (
					!sub.customLiveMsg.customLiveEnd ||
					!sub.customLiveMsg.customLiveEnd.trim()
				) {
					sub.customLiveMsg.customLiveEnd = this.config.customLiveEnd;
				}
				if (
					!sub.customLiveMsg.customLive ||
					!sub.customLiveMsg.customLive.trim()
				) {
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
				if (
					!sub.customGuardBuy.guardBuyMsg ||
					!sub.customGuardBuy.guardBuyMsg.trim()
				) {
					sub.customGuardBuy.guardBuyMsg =
						this.config.customGuardBuy.guardBuyMsg;
				}
				if (
					!sub.customGuardBuy.captainImgUrl ||
					!sub.customGuardBuy.captainImgUrl.trim()
				) {
					sub.customGuardBuy.captainImgUrl =
						this.config.customGuardBuy.captainImgUrl;
				}
				if (
					!sub.customGuardBuy.supervisorImgUrl ||
					!sub.customGuardBuy.supervisorImgUrl.trim()
				) {
					sub.customGuardBuy.supervisorImgUrl =
						this.config.customGuardBuy.supervisorImgUrl;
				}
				if (
					!sub.customGuardBuy.governorImgUrl ||
					!sub.customGuardBuy.governorImgUrl.trim()
				) {
					sub.customGuardBuy.governorImgUrl =
						this.config.customGuardBuy.governorImgUrl;
				}
			} else {
				if (this.config.customGuardBuy.enable) {
					sub.customGuardBuy.enable = false;
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
			const spacialDanmakuArr: Array<string> = [];
			const spacialUserEnterTheRoomArr: Array<string> = [];
			// 定义条件
			const conditions: [keyof Channel, Array<string>][] = [
				["dynamic", dynamicArr],
				["dynamicAtAll", dynamicAtAllArr],
				["live", liveArr],
				["liveAtAll", liveAtAllArr],
				["liveGuardBuy", liveGuardBuyArr],
				["superchat", superchatArr],
				["wordcloud", wordcloudArr],
				["liveSummary", liveSummaryArr],
				["spacialDanmaku", spacialDanmakuArr],
				["spacialUserEnterTheRoom", spacialUserEnterTheRoomArr],
			];
			// 遍历target
			for (const platform of sub.target) {
				// 遍历channelArr
				for (const channel of platform.channelArr) {
					// 构建目标
					const target = `${platform.platform}:${channel.channelId}`;
					// 判断
					for (const [key, arr] of conditions) {
						if (channel[key]) arr.push(target);
					}
				}
			}
			// 组装record
			pushArrMap.set(sub.uid, {
				dynamicArr,
				dynamicAtAllArr,
				liveArr,
				liveAtAllArr,
				liveSummaryArr,
				liveGuardBuyArr,
				superchatArr,
				wordcloudArr,
				spacialDanmakuArr,
				spacialUserEnterTheRoomArr,
			});
		}
		// 得到PushArrMap，并设置到bilibili-notify-push
		this.ctx["bilibili-notify-push"].pushArrMap = pushArrMap;
		this.ctx["bilibili-notify-push"].pushArrMapInitializing = true;
		// logger
		this.logger.debug("初始化推送群组/频道信息");
		this.logger.debug(pushArrMap);
	}

	registerCommands() {
		// 注册指令
		biliCommands.call(this);
		statusCommands.call(this);
	}

	registeringForEvents() {
		// 监听登录事件
		this.ctx.console.addListener("bilibili-notify/start-login", async () => {
			this.logger.info("触发登录事件");
			// 获取二维码
			// biome-ignore lint/suspicious/noExplicitAny: <any>
			let content: any;
			try {
				content = await this.ctx["bilibili-notify-api"].getLoginQRCode();
			} catch (_) {
				this.logger.error("获取登录二维码失败，请检查网络连接");
				return;
			}
			// 判断是否出问题
			if (content.code !== 0)
				return this.ctx.emit("bilibili-notify/login-status-report", {
					status: BiliLoginStatus.LOGIN_FAILED,
					msg: `获取二维码失败，请重试`,
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
						this.logger.error(`生成二维码失败：${err}`);
						return this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGIN_FAILED,
							msg: "生成二维码失败",
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
						this.logger.error(`获取登录状态失败：${e}`);
						return;
					}
					if (loginContent.data.code === 86101) {
						return this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGGING_QR,
							msg: "尚未扫码，请扫码",
						});
					}
					if (loginContent.data.code === 86090) {
						return this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGGING_QR,
							msg: "已扫码，但尚未确认，请确认",
						});
					}
					if (loginContent.data.code === 86038) {
						this.loginTimer();
						return this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGIN_FAILED,
							msg: "二维码已失效，请重新登录",
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
							msg: "登录成功，请重启插件。将在5秒后自动重启",
						});
						// 重启插件
						await this.ctx["bilibili-notify"].restartPlugin();
					}
					if (loginContent.code !== 0) {
						this.loginTimer();
						// 登录失败请重试
						return this.ctx.emit("bilibili-notify/login-status-report", {
							status: BiliLoginStatus.LOGIN_FAILED,
							msg: "登录失败，请重试",
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
		// 如果开启高级订阅才监听bilibili-notify事件
		if (this.config.advancedSub) {
			this.ctx.on(
				"bilibili-notify/advanced-sub",
				async (subs: Subscriptions) => {
					if (Object.keys(subs).length === 0) {
						// logger
						this.logger.info("订阅加载完毕，但未添加任何订阅");
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
		this.logger.info("已获取订阅信息，正在加载订阅");
		// 判断订阅分组是否存在
		const groupInfoResult = await this.getGroupInfo();
		// 判断是否获取成功
		if (groupInfoResult.code !== 0) {
			this.logger.error("获取分组信息失败，订阅加载失败");
			return;
		}
		// 赋值给成员变量
		this.groupInfo = groupInfoResult.data;
		// 加载订阅
		const { code, message } = await this.loadSubFromConfig(subs);
		// 判断是否加载成功
		if (code !== 0) {
			// logger
			this.logger.error(`加载订阅对象失败：${message}`);
			// 发送私聊消息
			await this.ctx["bilibili-notify-push"].sendPrivateMsg(
				"加载订阅对象失败，订阅初始化失败",
			);
			// 返回
			return;
		}
		// 启动动态监测
		this.ctx["bilibili-notify-dynamic"].startDynamicDetector(this.subManager);
		// 在控制台中显示订阅对象
		this.updateSubNotifier();
		// 初始化完毕
		this.logger.info("订阅加载完成！bilibili-notify 已启动！");
	}

	configSubsToSubscription(sub: BilibiliNotifySub.Config["subs"]) {
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
				spacialDanmaku: false,
				spacialUserEnterTheRoom: false,
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
				customSpecialDanmakuUsers: { enable: false },
				customSpecialUsersEnterTheRoom: { enable: false },
			};
		});
		// 返回subs
		return subs;
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
		return {
			code: 0,
			message: "获取分组明细成功",
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
					message: "订阅对象已在分组中",
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
					message: "账号未登录，请使用 `bili login` 登录后再进行订阅操作",
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
					message: "对方隐私设置，无法进行订阅操作",
				};
			},
			22003: () => {
				return {
					code: subUserData.code,
					message: "已将对方拉黑，无法进行订阅操作",
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
					message: "账号不存在，请检查 UID 输入是否正确",
				};
			},
			22001: () => {
				return {
					code: 0,
					message: "订阅对象是本人，无需添加到分组",
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
						message: "将订阅对象添加到分组失败，请稍后重试",
					};
				}
				// 添加成功
				return {
					code: 0,
					message: "成功将订阅对象添加到分组",
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
						message: "将订阅对象添加到分组失败，请稍后重试",
					};
				}
				// 添加成功
				return {
					code: 0,
					message: "成功将订阅对象添加到分组",
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
			this.logger.debug(`加载订阅 UID：${sub.uid}`);
			// 在B站中订阅该对象
			const subInfo = await this.subUserInBili(sub.uid);
			// 判断订阅是否成功
			if (subInfo.code !== 0 && subInfo.code !== 22015) return subInfo;
			// 判断是否是账号异常
			if (subInfo.code === 22015) {
				// 账号异常
				this.logger.warn(
					`账号异常，无法自动订阅 UID：${sub.uid}，请手动订阅并移动到 "订阅" 分组`,
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
				customSpecialDanmakuUsers: sub.customSpecialDanmakuUsers,
				customSpecialUsersEnterTheRoom: sub.customSpecialUsersEnterTheRoom,
			});
			// 判断是否有直播间号
			if (sub.live && !sub.roomid) {
				// logger
				this.logger.debug(`UID：${sub.uid} 请求了用户接口`);
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
					this.logger.error(`获取用户信息失败：${e.message}`);
					// 返回失败
					return {
						code: -1,
						message: `加载订阅 UID：${sub.uid} 失败`,
					};
				});
				// v_voucher风控
				if (userInfoCode === -352 && userInfoData.v_voucher) {
					// logger
					this.logger.warn("账号被风控，请使用 `bili cap` 指令进行风控验证");
					// 发送私聊消息
					await this.ctx["bilibili-notify-push"].sendPrivateMsg(
						"账号被风控，请使用 `bili cap` 指令进行风控验证",
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
						`UID：${sub.uid} 的用户没有开通直播间，无法订阅直播`,
					);
				}
				// 将roomid设置进去
				sub.roomid = userInfoData.live_room?.roomid;
			}
			// 判断是否需要订阅直播
			if (sub.live && sub.roomid) {
				// 启动直播监测
				await this.ctx["bilibili-notify-live"].liveDetectWithListener(sub);
			}
			// logger
			this.logger.debug(`订阅 UID：${sub.uid} 加载完成`);
			// 判断是不是最后一个订阅
			if (sub !== Object.values(subs).pop()) {
				// 不是最后一个订阅，执行delay
				// 1-3秒随机延迟
				const randomDelay = Math.floor(Math.random() * 3) + 1;
				// logger
				this.logger.debug(`设置随机延迟：${randomDelay} 秒`);
				// delay
				await this.ctx.sleep(randomDelay * 1000);
			}
		}
		return {
			code: 0,
			message: "订阅加载完成",
		};
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

namespace BilibiliNotifySub {
	export interface Config {
		logLevel: number;
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
		wordcloudStopWords: string;
		liveSummary: Array<string>;
		liveLoopTime: number;
		customLiveStart: string;
		customLive: string;
		customLiveEnd: string;
		customGuardBuy: {
			enable: boolean;
			captainImgUrl?: string;
			supervisorImgUrl?: string;
			governorImgUrl?: string;
			guardBuyMsg?: string;
		};
	}

	export const Config: Schema<Config> = Schema.object({
		logLevel: Schema.number().required(),
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
		wordcloudStopWords: Schema.string(),
		liveSummary: Schema.array(String),
		liveLoopTime: Schema.number().default(10),
		customLiveStart: Schema.string().required(),
		customLive: Schema.string(),
		customLiveEnd: Schema.string().required(),
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

export default BilibiliNotifySub;
