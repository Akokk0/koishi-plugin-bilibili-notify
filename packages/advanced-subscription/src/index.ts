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
			uid: Schema.string().required().description("订阅用户UID"),
			roomid: Schema.string().description(
				"订阅用户直播间号，不填则会请求用户接口自动获取，但请求该接口容易风控",
			),
			dynamic: Schema.boolean().default(false).description("是否订阅用户动态"),
			live: Schema.boolean().default(false).description("是否订阅用户直播"),
			liveEnd: Schema.boolean().default(true).description("是否订阅用户下播"),
			target: Schema.array(
				Schema.object({
					platform: Schema.string()
						.required()
						.description("推送平台，例如onebot、qq、discord"),
					channelArr: Schema.array(
						Schema.object({
							channelId: Schema.string().required().description("频道/群组号"),
							dynamic: Schema.boolean().default(true).description("动态通知"),
							dynamicAtAll: Schema.boolean()
								.default(false)
								.description("动态艾特全体"),
							live: Schema.boolean().default(true).description("直播通知"),
							liveAtAll: Schema.boolean()
								.default(true)
								.description("开播艾特全体"),
							liveGuardBuy: Schema.boolean()
								.default(false)
								.description("上舰通知"),
							superchat: Schema.boolean().default(false).description("SC通知"),
							wordcloud: Schema.boolean()
								.default(true)
								.description("弹幕词云通知"),
							liveSummary: Schema.boolean()
								.default(true)
								.description("直播总结通知"),
						}),
					)
						.role("table")
						.required()
						.description("需推送的频道/群组详细设置"),
				}),
			).description(
				"订阅用户需要发送的平台和频道/群组信息(一个平台下可以推送多个频道/群组)",
			),
			customLiveSummary: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description("是否开启个性化直播总结"),
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
							.description(
								"自定义直播总结语，开启弹幕词云自动发送。变量解释：-dmc代表总弹幕发送人数，-mdn代表主播粉丝牌子名，-dca代表总弹幕数，-un1到-un5代表弹幕发送条数前五名用户的用户名，-dc1到-dc5代表弹幕发送条数前五名的弹幕发送数量，数组每一行代表换行",
							),
					}),
					Schema.object({}),
				]),
			]),
			customLiveMsg: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description("是否开启个性化直播消息设置"),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						customLiveStart: Schema.string().description(
							"自定义开播提示语，-name代表UP昵称，-follower代表当前粉丝数，-link代表直播间链接（如果使用的是QQ官方机器人，请不要使用），\\n为换行。例如-name开播啦，会发送为xxxUP开播啦",
						),
						customLive: Schema.string().description(
							"自定义直播中提示语，-name代表UP昵称，-time代表开播时长，-watched代表累计观看人数，-link代表直播间链接（如果使用的是QQ官方机器人，请不要使用），\\n为换行。例如-name正在直播，会发送为xxxUP正在直播xxx",
						),
						customLiveEnd: Schema.string().description(
							"自定义下播提示语，-name代表UP昵称，-follower_change代表本场直播粉丝数变，-time代表开播时长，\\n为换行。例如-name下播啦，本次直播了-time，会发送为xxxUP下播啦，直播时长为xx小时xx分钟xx秒",
						),
					}),
					Schema.object({}),
				]),
			]),
			customCardStyle: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description("是否开启自定义卡片颜色"),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						cardColorStart: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description(
								"推送卡片的开始渐变背景色，请填入16进制颜色代码，参考网站：https://webkul.github.io/coolhue/",
							),
						cardColorEnd: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description(
								"推送卡片的结束渐变背景色，请填入16进制颜色代码，参考网站：https://colorate.azurewebsites.net/",
							),
						cardBasePlateColor: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description("推送卡片底板颜色，请填入16进制颜色代码"),
						cardBasePlateBorder: Schema.string()
							.pattern(/\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax)/)
							.description(
								"推送卡片底板边框宽度，请填入css单位，例如1px，12.5rem，100%",
							),
					}),
					Schema.object({}),
				]),
			]),
			customGuardBuy: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description("是否开启自定义上舰消息功能")
						.experimental(),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						guardBuyMsg: Schema.string()
							.default("【-mname的直播间】-uname加入了大航海（-guard）")
							.description(
								"自定义上舰消息，-uname代表用户昵称，-muname代表主播昵称，-guard代表舰长类型",
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
