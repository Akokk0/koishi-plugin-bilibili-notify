// biome-ignore assist/source/organizeImports: <sort>
import { type Context, type ForkScope, Service } from "koishi";

import {
	BilibiliNotifySub,
	BilibiliNotifyDynamic,
	BilibiliNotifyPush,
	BilibiliNotifyLive,
	BilibiliNotifyGenerateImg,
} from "./core";
import BilibiliNotifyAPI from "./api";
import type { BilibiliNotifyConfig } from "./config";

import { sysCommands } from "./command/index";

declare module "koishi" {
	interface Context {
		"bilibili-notify": BilibiliNotifyServerManager;
	}
}

class BilibiliNotifyServerManager extends Service<BilibiliNotifyConfig> {
	// 服务
	private servers: ForkScope[] = [];

	constructor(ctx: Context, config: BilibiliNotifyConfig) {
		super(ctx, "bilibili-notify");
		// 设置日志级别
		this.logger.level = config.logLevel;
		// 配置
		this.config = config;
	}

	protected start(): void | Promise<void> {
		// 注册插件
		if (!this.registerPlugin()) {
			this.logger.error(
				"主人呜呜 (；>_<) 女仆启动插件失败啦～请主人检查一下再试哦 (>ω<)♡",
			);
		}
		// 注册指令
		sysCommands.call(this);
	}

	public registerPlugin = () => {
		// 如果已经有服务则返回false
		if (this.servers.length !== 0) return false;
		// 注册插件
		try {
			// BA = BilibiliNotifyAPI
			const ba = this.ctx.plugin(BilibiliNotifyAPI, {
				logLevel: this.config.logLevel,
				userAgent: this.config.userAgent,
				key: this.config.key,
				ai: this.config.ai,
			});

			// GI = BilibiliNotifyGenerateImg
			const gi = this.ctx.plugin(BilibiliNotifyGenerateImg, {
				logLevel: this.config.logLevel,
				filter: this.config.filter,
				removeBorder: this.config.removeBorder,
				cardColorStart: this.config.cardColorStart,
				cardColorEnd: this.config.cardColorEnd,
				cardBasePlateColor: this.config.cardBasePlateColor,
				cardBasePlateBorder: this.config.cardBasePlateBorder,
				hideDesc: this.config.hideDesc,
				enableLargeFont: this.config.enableLargeFont,
				font: this.config.font,
				followerDisplay: this.config.followerDisplay,
			});

			// PS = BilibiliNotifyPush
			const ps = this.ctx.plugin(BilibiliNotifyPush, {
				logLevel: this.config.logLevel,
				master: this.config.master,
			});

			// DY = BilibiliNotifyDynamic
			const dy = this.ctx.plugin(BilibiliNotifyDynamic, {
				logLevel: this.config.logLevel,
				filter: this.config.filter,
				dynamicUrl: this.config.dynamicUrl,
				dynamicCron: this.config.dynamicCron,
				pushImgsInDynamic: this.config.pushImgsInDynamic,
				dynamicVideoUrlToBV: this.config.dynamicVideoUrlToBV,
			});

			// BL = BilibiliNotifyLive
			const bl = this.ctx.plugin(BilibiliNotifyLive, {
				logLevel: this.config.logLevel,
				wordcloudStopWords: this.config.wordcloudStopWords,
				ai: this.config.ai,
				restartPush: this.config.restartPush,
				pushTime: this.config.pushTime,
			});

			// CR = BilibiliNotifySub
			const cr = this.ctx.plugin(BilibiliNotifySub, {
				logLevel: this.config.logLevel,
				advancedSub: this.config.advancedSub,
				subs: this.config.subs,
				liveSummary: this.config.liveSummary,
				customLiveStart: this.config.customLiveStart,
				customLive: this.config.customLive,
				customLiveEnd: this.config.customLiveEnd,
				customGuardBuyImg: this.config.customGuardBuy,
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

	public disposePlugin = async () => {
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

	public restartPlugin = async (): Promise<boolean> => {
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

export default BilibiliNotifyServerManager;
