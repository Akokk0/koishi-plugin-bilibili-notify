/** biome-ignore-all assist/source/organizeImports: <import> */
import { DataService } from "@koishijs/plugin-console";
import type { Context } from "koishi";
import { BiliLoginStatus, type BiliDataServer } from "./type";

export default class BilibiliNotifyDataServer extends DataService<BiliDataServer> {
	private biliData: BiliDataServer = {
		status: BiliLoginStatus.LOADING_LOGIN_INFO,
		msg: "正在加载登录信息...",
	};

	constructor(ctx: Context) {
		super(
			ctx,
			"bilibili-notify" as keyof import("@koishijs/plugin-console").Console.Services,
		);

		// 监听消息
		ctx.on("bilibili-notify/login-status-report", (data: BiliDataServer) => {
			this.biliData = data;
			this.refresh();
		});
	}

	async get() {
		return this.biliData;
	}
}
