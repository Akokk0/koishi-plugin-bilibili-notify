// biome-ignore assist/source/organizeImports: <import>
import type { Context, Schema } from "koishi";
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
import BilibiliNotifyDataServer from "./data_server";

import * as Database from "./database";

import type { BiliDataServer, Subscriptions } from "./type";
import BilibiliNotifyServerManager from "./server_manager";

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

declare module "koishi" {
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

export function apply(ctx: Context, config: BilibiliNotifyConfig) {
	// load database
	ctx.plugin(Database);
	// Register ServerManager
	ctx.plugin(BilibiliNotifyServerManager, config);
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
