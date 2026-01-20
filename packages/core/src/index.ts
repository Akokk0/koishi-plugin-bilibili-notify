// biome-ignore assist/source/organizeImports: <import>
import { type Context, type ForkScope, type Schema, Service } from "koishi";
import {
	type BilibiliNotifyConfig,
	BilibiliNotifyConfigSchema,
} from "./config";
// biome-ignore lint/correctness/noUnusedImports: <import type>
import {} from "@koishijs/plugin-notifier";
// biome-ignore lint/correctness/noUnusedImports: <import type>
import {} from "@koishijs/plugin-console";
import { resolve } from "node:path";
// import plugins
import BilibiliNotifyGenerateImg from "./generate_img";
import BilibiliNotifyDataServer from "./data_server";
import {
	BilibiliNotifyCore,
	BilibiliNotifyDynamic,
	BilibiliNotifyLive,
	BilibiliNotifyPush,
} from "./core";

import BilibiliNotifyAPI from "./api";
import * as Database from "./database";

import type { BiliDataServer, Subscriptions } from "./type";

export const inject = ["puppeteer", "database", "notifier", "console"];

export const name = "bilibili-notify";

export const usage = /* html */ `
<h1>Bilibili-Notify</h1>
<p>使用问题请加群咨询 801338523</p>

---

主人好呀～我是笨笨女仆小助手哒 (〃∀〃)♡
专门帮主人管理 B 站订阅和直播推送的！
女仆虽然笨笨的，但是会尽力不出错哦～
主人，只要按照女仆的提示一步一步设置，女仆就可以乖乖帮您工作啦！

首先呢～请主人仔细阅读订阅相关的 subs 的填写说明 (>ω<)b
【主人账号部分非必填】然后再告诉女仆您的 主人账号 (///▽///)，并选择您希望女仆服务的平台～
接着，请认真填写 主人的 ID 和 群组 ID，确保信息完全正确～
这样女仆才能顺利找到您并准确汇报动态呢 (≧▽≦)

不用着急，女仆会一直在这里陪着您，一步一步完成设置～
主人只要乖乖填好这些信息，就能让女仆变得超级听话、超级勤快啦 (>///<)♡

想要重新登录的话，只需要点击个人名片的“Bilibili”Logo哦～

主人～注意事项要仔细看呀 (>_<)♡  
- 如果主人使用的是 onebot 机器人，平台名请填写 onebot，而不是 qq 哦～  
- 同样的呀，如果是 onebot 机器人，请务必填写 onebot，不要写成 qq 哦～  
- 女仆再提醒一次～onebot 机器人就填 onebot，千万不要写 qq 哦～  

乖乖遵守这些规则，女仆才能顺利帮主人工作呢 (*>ω<)b

---
`;

let globalConfig: BilibiliNotifyConfig;

declare module "koishi" {
	interface Context {
		"bilibili-notify": ServerManager;
	}

	interface Events {
		"bilibili-notify/login-status-report"(data: BiliDataServer): void;
		"bilibili-notify/advanced-sub"(subs: Subscriptions): void;
		"bilibili-notify/ready-to-recive"(): void;
	}
}

declare module "@koishijs/plugin-console" {
	namespace Console {
		interface Services {
			"bilibili-notify": BilibiliNotifyDataServer;
		}
	}

	interface Events {
		"bilibili-notify/start-login"(): void;
		"bilibili-notify/restart-plugin"(): void;
		// biome-ignore lint/suspicious/noExplicitAny: <any>
		"bilibili-notify/request-cors"(url: string): any;
	}
}

class ServerManager extends Service {
	// 服务
	servers: ForkScope[] = [];

	constructor(ctx: Context) {
		super(ctx, "bilibili-notify");

		// 插件运行相关指令
		const sysCom = ctx.command("bn", "bilibili-notify 插件运行相关指令", {
			permissions: ["authority:5"],
		});

		sysCom
			.subcommand(".restart", "重启插件")
			.usage("重启插件")
			.example("bn restart")
			.action(async () => {
				if (await this.restartPlugin()) {
					return "主人～女仆成功重启插件啦～乖乖继续为主人服务呢 (>ω<)♡";
				}
				return "主人呜呜 (；>_<) 女仆重启插件失败啦～请主人检查一下再试哦 (>ω<)♡";
			});

		sysCom
			.subcommand(".stop", "停止插件")
			.usage("停止插件")
			.example("bn stop")
			.action(async () => {
				if (await this.disposePlugin()) {
					return "主人～女仆已经停止插件啦～休息一下先 (>ω<)♡";
				}
				return "主人呜呜 (；>_<) 女仆停止插件失败啦～请主人检查一下再试哦 (>ω<)♡";
			});

		sysCom
			.subcommand(".start", "启动插件")
			.usage("启动插件")
			.example("bn start")
			.action(async () => {
				if (await this.registerPlugin()) {
					return "主人～女仆成功启动插件啦～准备好乖乖为主人工作呢 (>ω<)♡";
				}
				return "主人呜呜 (；>_<) 女仆启动插件失败啦～请主人检查一下再试哦 (>ω<)♡";
			});
	}

	protected start(): void | Promise<void> {
		// 注册插件
		if (!this.registerPlugin()) {
			this.logger.error(
				"主人呜呜 (；>_<) 女仆启动插件失败啦～请主人检查一下再试哦 (>ω<)♡",
			);
		}
	}

	registerPlugin = () => {
		// 如果已经有服务则返回false
		if (this.servers.length !== 0) return false;
		// 注册插件
		try {
			// BA = BilibiliNotifyAPI
			const ba = this.ctx.plugin(BilibiliNotifyAPI, {
				logLevel: globalConfig.logLevel,
				userAgent: globalConfig.userAgent,
				key: globalConfig.key,
				ai: globalConfig.ai,
			});

			// GI = BilibiliNotifyGenerateImg
			const gi = this.ctx.plugin(BilibiliNotifyGenerateImg, {
				logLevel: globalConfig.logLevel,
				filter: globalConfig.filter,
				removeBorder: globalConfig.removeBorder,
				cardColorStart: globalConfig.cardColorStart,
				cardColorEnd: globalConfig.cardColorEnd,
				cardBasePlateColor: globalConfig.cardBasePlateColor,
				cardBasePlateBorder: globalConfig.cardBasePlateBorder,
				hideDesc: globalConfig.hideDesc,
				enableLargeFont: globalConfig.enableLargeFont,
				font: globalConfig.font,
				followerDisplay: globalConfig.followerDisplay,
			});

			// PS = BilibiliNotifyPush
			const ps = this.ctx.plugin(BilibiliNotifyPush, {
				logLevel: globalConfig.logLevel,
				master: globalConfig.master,
			});

			// DY = BilibiliNotifyDynamic
			const dy = this.ctx.plugin(BilibiliNotifyDynamic, {
				logLevel: globalConfig.logLevel,
				filter: globalConfig.filter,
				dynamicUrl: globalConfig.dynamicUrl,
				dynamicCron: globalConfig.dynamicCron,
				pushImgsInDynamic: globalConfig.pushImgsInDynamic,
				dynamicVideoUrlToBV: globalConfig.dynamicVideoUrlToBV,
			});

			// BL = BilibiliNotifyLive
			const bl = this.ctx.plugin(BilibiliNotifyLive, {
				logLevel: globalConfig.logLevel,
				wordcloudStopWords: globalConfig.wordcloudStopWords,
				ai: globalConfig.ai,
				restartPush: globalConfig.restartPush,
				pushTime: globalConfig.pushTime,
			});

			// CR = BilibiliNotifyCore
			const cr = this.ctx.plugin(BilibiliNotifyCore, {
				logLevel: globalConfig.logLevel,
				advancedSub: globalConfig.advancedSub,
				subs: globalConfig.subs,
				liveSummary: globalConfig.liveSummary,
				customLiveStart: globalConfig.customLiveStart,
				customLive: globalConfig.customLive,
				customLiveEnd: globalConfig.customLiveEnd,
				customGuardBuyImg: globalConfig.customGuardBuy,
			});

			// 添加服务
			this.servers.push(ba, gi, ps, dy, bl, cr);
		} catch (e) {
			this.logger.error(
				`主人呜呜 (；>_<) 女仆注册插件失败啦～错误信息：${e}，请主人帮女仆看看呀 (>ω<)♡`,
			);
			return false;
		}
		// 成功返回true
		return true;
	};

	disposePlugin = async () => {
		// 如果没有服务则返回false
		if (this.servers.length === 0) return false;
		// 遍历服务
		await new Promise((resolve) => {
			for (const fork of this.servers) {
				fork.dispose();
			}
			// 清空服务
			this.servers = [];
			resolve("ok");
		});
		// 成功返回true
		return true;
	};

	restartPlugin = async (): Promise<boolean> => {
		// 如果没有服务则返回false
		if (this.servers.length === 0) {
			// logger
			this.logger.warn(
				"主人～女仆发现插件目前没有运行哦～请主人使用指令 bn start 启动插件呀 (>ω<)♡",
			);
			// 返回
			return false;
		}
		// 停用插件
		await this.disposePlugin();
		// 隔一秒启动插件
		return new Promise((resolve) => {
			this.ctx.setTimeout(() => {
				try {
					this.registerPlugin();
				} catch (e) {
					this.logger.error(
						`主人呜呜 (；>_<) 女仆重启插件失败啦～错误信息：${e}，请主人帮女仆看看呀 (>ω<)♡`,
					);
					resolve(false);
				}
				resolve(true);
			}, 1000);
		});
	};
}

export function apply(ctx: Context, config: BilibiliNotifyConfig) {
	// 设置config
	globalConfig = config;
	// load database
	ctx.plugin(Database);
	// Register ServerManager
	ctx.plugin(ServerManager);
	// load DataServer
	ctx.plugin(BilibiliNotifyDataServer);
	// 添加控制台
	ctx.console.addEntry({
		dev: resolve(__dirname, "../client/index.ts"),
		prod: resolve(__dirname, "../dist"),
	});
	// 当用户输入“恶魔兔，启动！”时，执行 help 指令
	ctx.middleware((session, next) => {
		if (session.content === "恶魔兔，启动！") {
			return session.send("启动不了一点");
		}
		return next();
	});
}

export const Config: Schema<BilibiliNotifyConfig> = BilibiliNotifyConfigSchema;
