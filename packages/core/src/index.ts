// biome-ignore assist/source/organizeImports: <import>
import { type Context, type ForkScope, type Schema, Service } from "koishi";
import { type BAConfig, BAConfigSchema } from "./config";
// biome-ignore lint/correctness/noUnusedImports: <import type>
import {} from "@koishijs/plugin-notifier";
// import plugins
import ComRegister from "./command_register";
import * as Database from "./database";
// import Service
import GenerateImg from "./generate_img";
import BiliAPI from "./bili_api";
import BLive from "./bili_live";
import type { Subscriptions } from "./type";

export const inject = ["puppeteer", "database", "notifier"];

export const name = "bilibili-notify";

export const usage = `
	Bilibili-Notify
	如遇到使用问题或bug，请加群咨询 801338523
`;

let globalConfig: BAConfig;

declare module "koishi" {
	interface Context {
		"bilibili-notify": ServerManager;
	}

	interface Events {
		"bilibili-notify/advanced-sub"(subs: Subscriptions): void;
		"bilibili-notify/ready-to-recive"(): void;
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
				this.logger.info("调用 bn restart 指令");
				if (await this.restartPlugin()) {
					return "插件重启成功";
				}
				return "插件重启失败";
			});

		sysCom
			.subcommand(".stop", "停止插件")
			.usage("停止插件")
			.example("bn stop")
			.action(async () => {
				this.logger.info("调用 bn stop 指令");
				if (await this.disposePlugin()) {
					return "插件已停止";
				}
				return "停止插件失败";
			});

		sysCom
			.subcommand(".start", "启动插件")
			.usage("启动插件")
			.example("bn start")
			.action(async () => {
				this.logger.info("调用 bn start 指令");
				if (await this.registerPlugin()) {
					return "插件启动成功";
				}
				return "插件启动失败";
			});
	}

	protected start(): void | Promise<void> {
		// 注册插件
		if (!this.registerPlugin()) {
			this.logger.error("插件启动失败");
		}
	}

	registerPlugin = () => {
		// 如果已经有服务则返回false
		if (this.servers.length !== 0) return false;
		// 注册插件
		try {
			// BA = BiliAPI
			const ba = this.ctx.plugin(BiliAPI, {
				userAgent: globalConfig.userAgent,
				key: globalConfig.key,
			});

			// GI = GenerateImg
			const gi = this.ctx.plugin(GenerateImg, {
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

			// CR = ComRegister
			const cr = this.ctx.plugin(ComRegister, {
				advancedSub: globalConfig.advancedSub,
				subs: globalConfig.subs,
				master: globalConfig.master,
				wordcloudStopWords: globalConfig.wordcloudStopWords,
				liveSummary: globalConfig.liveSummary,
				liveDetectType: globalConfig.liveDetectType,
				restartPush: globalConfig.restartPush,
				pushTime: globalConfig.pushTime,
				pushImgsInDynamic: globalConfig.pushImgsInDynamic,
				customLiveStart: globalConfig.customLiveStart,
				customLive: globalConfig.customLive,
				customLiveEnd: globalConfig.customLiveEnd,
				dynamicUrl: globalConfig.dynamicUrl,
				dynamicCron: globalConfig.dynamicCron,
				dynamicVideoUrlToBV: globalConfig.dynamicVideoUrlToBV,
				filter: globalConfig.filter,
				dynamicDebugMode: globalConfig.dynamicDebugMode,
			});

			// BL = BLive
			const bl = this.ctx.plugin(BLive);

			// 添加服务
			this.servers.push(ba);
			this.servers.push(bl);
			this.servers.push(gi);
			this.servers.push(cr);
		} catch (e) {
			this.logger.error("插件注册失败", e);
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
		if (this.servers.length === 0) return false;
		// 停用插件
		await this.disposePlugin();
		// 隔一秒启动插件
		return new Promise((resolve) => {
			this.ctx.setTimeout(() => {
				try {
					this.registerPlugin();
				} catch (e) {
					this.logger.error("重启插件失败", e);
					resolve(false);
				}
				resolve(true);
			}, 1000);
		});
	};
}

export function apply(ctx: Context, config: BAConfig) {
	// 设置config
	globalConfig = config;
	// load database
	ctx.plugin(Database);
	// Register ServerManager
	ctx.plugin(ServerManager);
	// 当用户输入“恶魔兔，启动！”时，执行 help 指令
	ctx.middleware((session, next) => {
		if (session.content === "恶魔兔，启动！") {
			return session.send("启动不了一点");
		}
		return next();
	});
}

export const Config: Schema<BAConfig> = BAConfigSchema;
