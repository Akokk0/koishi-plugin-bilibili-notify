import { type Context, Schema } from "koishi";
// biome-ignore lint/correctness/noUnusedImports: <import type>
import {} from "koishi-plugin-bilibili-notify";

export const name = "bilibili-notify-advanced-subscription";

export interface Config {
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	subs: {};
}

export const Config: Schema<Config> = Schema.object({
	subs: Schema.dict(
		Schema.object({
			uid: Schema.string()
				.required()
				.description("要订阅的UP主的UID"),
			roomid: Schema.string().description(
				"直播间号，留空则自动查询（可能触发风控）",
			),
			dynamic: Schema.boolean()
				.default(false)
				.description("是否订阅动态通知"),
			live: Schema.boolean()
				.default(false)
				.description("是否订阅直播开播通知"),
			liveEnd: Schema.boolean()
				.default(true)
				.description("是否订阅直播下播通知"),

			target: Schema.array(
				Schema.object({
					platform: Schema.string()
						.required()
						.description("消息推送平台（如 onebot、qq、discord）"),

					channelArr: Schema.array(
						Schema.object({
							channelId: Schema.string()
								.required()
								.description("频道或群组号"),
							dynamic: Schema.boolean()
								.default(true)
								.description("动态通知"),
							dynamicAtAll: Schema.boolean()
								.default(false)
								.description("动态@所有人"),
							live: Schema.boolean()
								.default(true)
								.description("直播通知"),
							liveAtAll: Schema.boolean()
								.default(true)
								.description("开播@所有人"),
							liveGuardBuy: Schema.boolean()
								.default(false)
								.description("上舰通知"),
							superchat: Schema.boolean()
								.default(false)
								.description("SC通知"),
							wordcloud: Schema.boolean()
								.default(true)
								.description("弹幕词云"),
							liveSummary: Schema.boolean()
								.default(true)
								.description("直播总结"),
						}),
					)
						.role("table")
						.required()
						.description("推送目标配置"),
				}),
			).description("推送平台和频道/群组列表"),

			customLiveSummary: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description("是否启用自定义直播总结"),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						liveSummary: Schema.array(String)
							.default([
								"🔍【弹幕情报站】本场直播数据如下：",
								"🧍‍♂️ 总共 -dmc 位-mdn上线",
								"💬 共计 -dca 条弹幕飞驰而过",
								"📊 热词云图已生成，快来看看你有没有上榜！",
								"👑 本场顶级输出选手：",
								"🥇 -un1 - 弹幕输出 -dc1 条",
								"🥈 -un2 - 弹幕 -dc2 条，萌力惊人",
								"🥉 -un3 - -dc3 条精准狙击",
								"🎖️ 特别嘉奖：-un4 & -un5",
								"你们的弹幕，我们都记录在案！🕵️‍♀️",
							])
							.role("table")
							.description("直播总结模板，支持变量：-dmc（弹幕数）、-mdn（观看人数）、-dca（弹幕总数）、-un1~5（弹幕排行用户）、-dc1~5（弹幕排行数量）"),
					}),
					Schema.object({}),
				]),
			]),

			customLiveMsg: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description("是否启用自定义直播消息"),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						customLiveStart: Schema.string().description(
							"开播消息模板，支持变量：-name（UP主名字）、-follower（粉丝数）、-link（直播间链接，QQ官方机器人不支持）",
						),
						customLive: Schema.string().description(
							"直播中消息模板，支持变量：-name（UP主名字）、-time（开播时长）、-watched（观看人数）、-link（直播间链接，QQ官方机器人不支持）",
						),
						customLiveEnd: Schema.string().description(
							"下播消息模板，支持变量：-name（UP主名字）、-follower_change（粉丝变化）、-time（开播时长）",
						),
					}),
					Schema.object({}),
				]),
			]),

			customCardStyle: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description("是否启用自定义卡片样式"),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						cardColorStart: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description("卡片渐变起始颜色（16进制）"),
						cardColorEnd: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description("卡片渐变结束颜色（16进制）"),
						cardBasePlateColor: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description("底板颜色（16进制）"),
						cardBasePlateBorder: Schema.string()
							.pattern(/\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax)/)
							.description("底板边框宽度（需带单位）"),
					}),
					Schema.object({}),
				]),
			]),

			customGuardBuy: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description("是否启用自定义上舰消息"),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						guardBuyMsg: Schema.string()
							.default("【-mname的直播间】-uname加入了大航海（-guard）")
							.description(
								"上舰消息模板，支持变量：-uname（用户昵称）、-mname（主播名字）、-guard（舰长类别）",
							),
						captainImgUrl: Schema.string()
							.default(
								"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/captain-Bjw5Byb5.png",
							)
							.description("舰长图片链接"),
						supervisorImgUrl: Schema.string()
							.default(
								"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/supervisor-u43ElIjU.png",
							)
							.description("提督图片链接"),
						governorImgUrl: Schema.string()
							.default(
								"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/governor-DpDXKEdA.png",
							)
							.description("总督图片链接"),
					}),
					Schema.object({}) as Schema<Partial<Config>>,
				]),
			]),
		}).collapse(),
	),
});

export function apply(ctx: Context, config: Config) {
	// 触发事件
	ctx.emit("bilibili-notify/advanced-sub", config.subs);
	// 注册监听事件
	ctx.on("bilibili-notify/ready-to-recive", () => {
		// 触发事件
		ctx.emit("bilibili-notify/advanced-sub", config.subs);
	});
}
