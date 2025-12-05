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
				.description(
					"主人～请在这里填写订阅用户的 UID 哦～女仆会根据 UID 来帮主人关注动态呢 (>ω<)♡",
				),
			roomid: Schema.string().description(
				"主人～请在这里填写订阅用户的直播间号哦～如果不填，女仆会请求用户接口自动获取，不过这个接口容易触发风控呢 (；>_<)♡",
			),
			dynamic: Schema.boolean()
				.default(false)
				.description(
					"主人～请选择是否订阅该用户的动态哦～女仆会根据主人的选择来帮主人监控动态呢 (>ω<)♡",
				),
			live: Schema.boolean()
				.default(false)
				.description(
					"主人～请选择是否订阅该用户的直播哦～女仆会乖乖在直播开播时通知主人呢 (>ω<)♡",
				),
			liveEnd: Schema.boolean()
				.default(true)
				.description(
					"主人～请选择是否订阅该用户的下播通知哦～女仆会在直播结束时乖乖提醒主人呢 (>ω<)♡",
				),
			target: Schema.array(
				Schema.object({
					platform: Schema.string()
						.required()
						.description(
							"主人～请选择消息要推送到哪个平台哦～例如 onebot、qq、discord～女仆会乖乖把消息送到主人选的平台呢 (>ω<)♡",
						),
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
						.description(
							"主人～请填写需推送的频道或群组的详细信息哦～女仆会根据主人填写的内容乖乖发送消息呢 (>ω<)♡",
						),
				}),
			).description(
				"主人～请填写订阅用户需要发送的平台和频道/群组信息哦～一个平台下可以推送到多个频道/群组，女仆会乖乖帮主人送到每个地方呢 (>ω<)♡",
			),
			customLiveSummary: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description(
							"主人～请选择是否开启个性化直播总结哦～女仆会根据主人的选择生成特别的直播总结呢 (>ω<)♡",
						),
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
								"这里可以自定义直播总结的模版～每一行就是一段内容，女仆会按主人写的格式发送哦 (〃´-`〃)♡变量说明也在下面，主人随意发挥吧！变量解释：-dmc代表总弹幕发送人数，-mdn代表主播粉丝牌子名，-dca代表总弹幕数，-un1到-un5代表弹幕发送条数前五名用户的用户名，-dc1到-dc5代表弹幕发送条数前五名的弹幕发送数量，数组每一行代表换行",
							),
					}),
					Schema.object({}),
				]),
			]),
			customLiveMsg: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description(
							"主人～要不要开启个性化直播消息呀？(>ω<) 默认是关的呐",
						),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						customLiveStart: Schema.string().description(
							"主人~这是开播提示语呢！-name会变成UP主昵称，-follower会显示粉丝数，-link会变成直播间链接哦（如果用QQ官方机器人就不要用啦）～\\n可以换行呢～比如写“-name开播啦”，女仆就会发“xxxUP开播啦”啦～",
						),
						customLive: Schema.string().description(
							"主人～这是直播中提示语呢！-name是UP主名字，-time是开播多久了，-watched是看的人数，-link是直播间链接哦（QQ官方机器人不要用）～\\n可以换行～比如“-name正在直播”，女仆就会发“xxxUP正在直播xxx”啦～",
						),
						customLiveEnd: Schema.string().description(
							"主人～这是下播提示语啦！-name是UP主名字，-follower_change是粉丝变动，-time是开播时长哦～\\n可以换行啦～比如“-name下播啦，本次直播了-time”，女仆就会发“xxxUP下播啦，直播时长xx小时xx分钟xx秒”～",
						),
					}),
					Schema.object({}),
				]),
			]),
			customCardStyle: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description("主人～要不要开启自定义卡片颜色呀？(>ω<) 默认关着呢"),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						cardColorStart: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description(
								"主人～这是卡片渐变开始的颜色呢！填16进制颜色代码吧～参考网站：https://webkul.github.io/coolhue/ ✨",
							),
						cardColorEnd: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description(
								"主人～这是卡片渐变结束的颜色呢～填16进制颜色代码吧～参考网站：https://colorate.azurewebsites.net/ 🎨",
							),
						cardBasePlateColor: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description("主人～这是卡片底板的颜色呢～填16进制颜色代码～"),
						cardBasePlateBorder: Schema.string()
							.pattern(/\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax)/)
							.description(
								"主人～这是卡片底板边框的宽度呢～记得带单位哦，比如1px, 12.5rem, 100%～",
							),
					}),
					Schema.object({}),
				]),
			]),
			customGuardBuy: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description(
							"主人～要不要开启自定义上舰消息呀？",
						),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						guardBuyMsg: Schema.string()
							.default("【-mname的直播间】-uname加入了大航海（-guard）")
							.description(
								"主人～这是上舰消息呢～-uname是用户昵称，-muname是主播昵称，-guard是舰长类型哦～女仆会帮你发送～",
							),
						captainImgUrl: Schema.string()
							.default(
								"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/captain-Bjw5Byb5.png",
							)
							.description("主人～这是舰长图片链接呢～"),
						supervisorImgUrl: Schema.string()
							.default(
								"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/supervisor-u43ElIjU.png",
							)
							.description("主人～这是提督图片链接呢～"),
						governorImgUrl: Schema.string()
							.default(
								"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/governor-DpDXKEdA.png",
							)
							.description("主人～这是总督图片链接啦～"),
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
