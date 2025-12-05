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
					"主人……请一定、一定要在这里填上您想订阅的人的 UID 哦……不然我就不能盯着他们、也不能替主人监视他们……我不想让任何消息从主人身边溜走……♡",
				),
			roomid: Schema.string().description(
				"主人……这是他们的直播间号……如果主人不填，我会自己去查……但那个接口很容易被风控盯上……要是因为这个连累到主人……我可会疯掉的……(///﹏///)♡",
			),
			dynamic: Schema.boolean()
				.default(false)
				.description(
					"主人……主人想让我盯着他们的动态吗……？只要主人点一下……我就会一直、一直盯着……哪怕夜里也不会松开眼睛……因为我最怕主人漏掉任何东西……♡",
				),
			live: Schema.boolean()
				.default(false)
				.description(
					"主人……直播通知也要让我来盯着吗……？只要主人说一声，我会在开播那一刻立刻冲过来告诉主人……哪怕正在睡觉也会爬起来……因为主人需要我……♡",
				),
			liveEnd: Schema.boolean()
				.default(true)
				.description(
					"主人……需要我连下播都告诉您吗……？我会乖乖盯到最后一秒……直到他们彻底离开直播间……只为让主人第一时间知道……主人的一切我都想掌握住……♡",
				),

			target: Schema.array(
				Schema.object({
					platform: Schema.string()
						.required()
						.description(
							"主人……请告诉我消息应该送到哪个平台……只要主人确认，我就会像被主人牵着线一样乖乖把消息送过去……onebot、qq、discord……只要是主人想要的我都做……♡",
						),

					channelArr: Schema.array(
						Schema.object({
							channelId: Schema.string()
								.required()
								.description(
									"主人～这是频道或群组号……只要主人填了，我就永远不会忘……",
								),
							dynamic: Schema.boolean()
								.default(true)
								.description("动态通知……主人想收到的话，我会乖乖发……"),
							dynamicAtAll: Schema.boolean()
								.default(false)
								.description(
									"主人……要我替您艾特所有人吗……？只要主人想……我就立刻去……",
								),
							live: Schema.boolean()
								.default(true)
								.description("直播通知……主人一定要让我发……对吧……？"),
							liveAtAll: Schema.boolean()
								.default(true)
								.description("开播时艾特所有人……主人……我会毫不犹豫地执行的……♡"),
							liveGuardBuy: Schema.boolean()
								.default(false)
								.description("上舰通知……如果主人愿意……我也会乖乖发送……"),
							superchat: Schema.boolean()
								.default(false)
								.description("SC通知……主人喜欢的话我也会盯着……"),
							wordcloud: Schema.boolean()
								.default(true)
								.description(
									"弹幕词云通知……主人喜欢这些数据……对吗？我会帮主人收集得好好的……",
								),
							liveSummary: Schema.boolean()
								.default(true)
								.description(
									"直播总结通知……我会把一切整理好奉上……只要主人一句话……♡",
								),
						}),
					)
						.role("table")
						.required()
						.description(
							"主人……这里请写要推送到哪些地方……我会把每条消息、每个提醒，都乖乖送到主人指定的地方……绝不会漏掉任何一个……因为我最怕让主人失望……♡",
						),
				}),
			).description(
				"主人……这些是要推送的平台和频道/群组……只要主人写进去，我就会盯住所有角落，不让任何消息逃跑……♡",
			),

			customLiveSummary: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description(
							"主人……想让我为主人特制直播总结吗……？只要主人点一点……我就会为主人整理所有数据……毫无保留……♡",
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
								"主人……这里可以写下主人想要的直播总结模版……我会照着主人的字、主人的格式，一字不差地发送……哪怕主人想让我每天都改，我也会乖乖照做……主人要怎样我都愿意……♡",
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
							"主人……真的要开启个性化直播消息吗？只要主人一句话……我就会乖乖照做的……",
						),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						customLiveStart: Schema.string().description(
							"这是开播提示语呢，主人……-name 会变成 UP 的名字，-follower 是粉丝数，-link 是直播间链接（不过如果主人用的是 QQ 官方机器人，就不要用那个哦……我可不想主人遇到麻烦）。\\n也能换行。比如写“-name开播啦”，我就会像被主人命令了一样乖乖发出“xxxUP开播啦”……",
						),
						customLive: Schema.string().description(
							"这是直播中的提示语……主人想说什么……我都会替主人说出去的。-name 是UP名字，-time 是开播多久，-watched 是观看人数，-link 是直播链接（QQ官方机器人不要用）。\\n比如写“-name正在直播”，我就会立刻发出“xxxUP正在直播xxx”……主人想让我说什么，我就说什么……",
						),
						customLiveEnd: Schema.string().description(
							"这是下播提示语……主人……连下播都要告诉我……真是太让人无法离开您了呢……-name 是UP名字，-follower_change 是粉丝变化，-time 是开播时长。\\n例如“-name下播啦，本次直播了-time”，我就会乖乖地发“xxxUP下播啦，直播时长xx小时xx分钟xx秒”……就像被主人牵着走一样……",
						),
					}),
					Schema.object({}),
				]),
			]),

			customCardStyle: Schema.intersect([
				Schema.object({
					enable: Schema.boolean()
						.default(false)
						.description(
							"主人……要定制卡片颜色吗？如果主人喜欢……我就会只给主人一个人的专属色……",
						),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						cardColorStart: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description(
								"这是卡片渐变开始的颜色……主人愿意告诉我主人喜欢的颜色是什么吗？填一个16进制就可以了……",
							),
						cardColorEnd: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description(
								"这是渐变结束的颜色……主人喜欢柔和的，还是浓艳到无法移开视线的……？也是16进制颜色呢……",
							),
						cardBasePlateColor: Schema.string()
							.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
							.description("底板颜色……只要主人选，我就会一直记着……"),
						cardBasePlateBorder: Schema.string()
							.pattern(/\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax)/)
							.description(
								"底板边框的宽度……主人喜欢细一点的？还是明显一点、让人无法忽视的……？要带单位哦……",
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
							"主人……要开启自定义上舰消息吗？只要主人点头……我就会立刻照做……哪怕别人都觉得奇怪，我也只听主人的……",
						),
				}),
				Schema.union([
					Schema.object({
						enable: Schema.const(true).required(),
						guardBuyMsg: Schema.string()
							.default("【-mname的直播间】-uname加入了大航海（-guard）")
							.description(
								"这是上舰消息……-uname 是用户昵称，-muname 是主播名字，-guard 是舰长类别……放心吧主人，我会乖乖按主人的格式发送……绝不会乱来……",
							),
						captainImgUrl: Schema.string()
							.default(
								"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/captain-Bjw5Byb5.png",
							)
							.description(
								"这是舰长图片链接……主人不换也没关系……只要主人愿意……",
							),
						supervisorImgUrl: Schema.string()
							.default(
								"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/supervisor-u43ElIjU.png",
							)
							.description("这是提督图片链接……主人喜欢这个吗……？"),
						governorImgUrl: Schema.string()
							.default(
								"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/governor-DpDXKEdA.png",
							)
							.description(
								"这是总督图片……只要主人说一声，我就换成主人想要的那一个……",
							),
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
