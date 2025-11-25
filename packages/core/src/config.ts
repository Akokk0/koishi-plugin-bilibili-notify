import { Schema } from "koishi";

export interface BAConfig {
	// TODO: improve type
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	require: {};
	key: string;
	// TODO: improve type
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	master: {};
	// TODO: improve type
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	basicSettings: {};
	userAgent: string;
	ai: {
		enable: boolean;
		apiKey?: string;
		baseURL?: string;
		model?: string;
		persona?: string;
	};
	// TODO: improve type
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	subTitle: {};
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
	// TODO: improve type
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	dynamic: {};
	dynamicUrl: boolean;
	dynamicCron: string;
	dynamicVideoUrlToBV: boolean;
	pushImgsInDynamic: boolean;
	// TODO: improve type
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	live: {};
	wordcloudStopWords: string;
	liveSummary: Array<string>;
	customGuardBuy: {
		enable: boolean;
		guardBuyMsg?: string;
		captainImgUrl?: string;
		supervisorImgUrl?: string;
		governorImgUrl?: string;
	};
	restartPush: boolean;
	pushTime: number;
	customLiveStart: string;
	customLive: string;
	customLiveEnd: string;
	followerDisplay: boolean;
	hideDesc: boolean;
	// TODO: improve type
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	style: {};
	removeBorder: boolean;
	cardColorStart: string;
	cardColorEnd: string;
	cardBasePlateColor: string;
	cardBasePlateBorder: string;
	enableLargeFont: boolean;
	font: string;
	// TODO: improve type
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	filter: {};
	// TODO: improve type
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	debug: {};
	dynamicDebugMode: boolean;
}

export const BAConfigSchema: Schema<BAConfig> = Schema.object({
	require: Schema.object({}).description("必填设置"),

	key: Schema.string()
		.pattern(/^[0-9a-f]{32}$/)
		.role("secret")
		.required()
		.description(
			"请输入一个32位小写字母的十六进制密钥（例如：9b8db7ae562b9864efefe06289cc5530），使用此密钥将你的B站登录信息存储在数据库中，请一定保存好此密钥。如果你忘记了此密钥，必须重新登录。你可以自行生成，或到这个网站生成：https://www.sexauth.com/",
		),

	master: Schema.intersect([
		Schema.object({
			enable: Schema.boolean()
				.default(false)
				.description(
					"是否开启主人账号功能，开启后如果机器人运行错误会向您进行报告。如果您的机器人没有私聊权限请不要开启此功能",
				),
		}).description("主人账号"),
		Schema.union([
			Schema.object({
				enable: Schema.const(true).required(),
				platform: Schema.union([
					"qq",
					"qqguild",
					"onebot",
					"discord",
					"red",
					"telegram",
					"satori",
					"chronocat",
					"lark",
				]).description("请选择您的私人机器人平台"),
				masterAccount: Schema.string()
					.role("secret")
					.required()
					.description(
						"主人账号，在Q群使用可直接使用QQ号，若在其他平台使用，请使用inspect插件获取自身ID",
					),
				masterAccountGuildId: Schema.string()
					.role("secret")
					.description(
						"主人账号所在的群组ID，只有在QQ频道、Discord这样的环境才需要填写，请使用inspect插件获取群组ID",
					),
			}),
			Schema.object({}),
		]),
	]),

	basicSettings: Schema.object({}).description("基本设置"),

	userAgent: Schema.string().description(
		"设置请求头User-Agen，请求出现-352时可以尝试修改，UA获取方法可参考：https://blog.csdn.net/qq_44503987/article/details/104929111",
	),

	ai: Schema.intersect([
		Schema.object({
			enable: Schema.boolean().default(false).description("是否开启AI功能"),
		}),
		Schema.union([
			Schema.object({
				enable: Schema.const(true).required(),
				apiKey: Schema.string()
					.role("secret")
					.required()
					.description("API KEY"),
				baseURL: Schema.string().required().description("API 访问地址"),
				model: Schema.string().default("gpt-3.5-turbo").description("AI模型"),
				persona: Schema.string()
					.description("AI系统角色设定")
					.default(
						"你是一个风趣幽默的主播助理，你的任务是根据提供的直播数据生成一段有趣且富有创意的直播总结。请确保你的回答简洁明了，避免使用过于复杂的语言或长句子。请注意，你的回答必须与提供的数据相关，并且不能包含任何虚构的信息。如果你无法根据提供的数据生成总结，请礼貌地说明你无法完成任务。",
					),
			}),
			Schema.object({ enable: Schema.const(false) }),
		]),
	]),

	subTitle: Schema.object({}).description("订阅配置"),

	advancedSub: Schema.boolean()
		.default(false)
		.description(
			"是否开启高级订阅，高级订阅是独立于本插件的一个专门用于订阅配置的插件，用于高度自定义订阅消息。若开启高级订阅，请打开该选项并下载插件 bilibili-notify-advanced-subscription",
		),

	subs: Schema.array(
		Schema.object({
			name: Schema.string().required().description("UP昵称"),
			uid: Schema.string().required().description("UID和roomid"),
			dynamic: Schema.boolean().default(true).description("动态"),
			dynamicAtAll: Schema.boolean().default(false).description("动态@全体"),
			live: Schema.boolean().default(true).description("直播"),
			liveAtAll: Schema.boolean().default(true).description("直播@全体"),
			liveGuardBuy: Schema.boolean().default(false).description("上舰消息"),
			superchat: Schema.boolean().default(false).description("SC消息"),
			wordcloud: Schema.boolean().default(true).description("弹幕词云"),
			liveSummary: Schema.boolean().default(true).description("直播总结"),
			platform: Schema.string().required().description("平台名"),
			target: Schema.string().required().description("群号/频道号"),
		}),
	)
		.role("table")
		.description(
			"请在这里填写订阅信息；UP昵称是必填项，影响通知时显示的UP主昵称；UID和roomid，请填写订阅用户的UID，如果经常在初始化插件遇到风控问题，请补充直播间房间号，使用英文逗号分隔例如：1234567,114514；平台名，请填写adapter-xxxx中的xxxx，例如你的机器人使用的是adapter-onebot就填写onebot；群号/频道号，直接填写即可，如果有多个群聊或频道请使用英文逗号分隔，例如：1234567,2345678",
		),

	dynamic: Schema.object({}).description("动态推送设置"),

	dynamicUrl: Schema.boolean()
		.default(false)
		.description(
			"发送动态时是否同时发送链接。注意：如果使用的是QQ官方机器人不能开启此项！",
		),

	dynamicCron: Schema.string()
		.default("*/2 * * * *")
		.description("动态监测时间，请填入cron表达式，请勿填入过短时间"),

	dynamicVideoUrlToBV: Schema.boolean()
		.default(false)
		.description(
			"如果推送的动态是视频动态，且开启了发送链接选项，开启此选项则会将链接转换为BV号以便其他用途",
		),

	pushImgsInDynamic: Schema.boolean()
		.default(false)
		.description(
			"是否推送动态中的图片，默认不开启。开启后会单独推送动态中的图片，该功能容易导致QQ风控",
		),

	live: Schema.object({}).description("直播推送设置"),

	wordcloudStopWords: Schema.string().description(
		"词云生成时的停用词，多个停用词请使用英文逗号分隔，例如：哔哩哔哩,弹幕,直播,词云",
	),

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
			Schema.object({}) as Schema<Partial<BAConfig>>,
		]),
	]),

	restartPush: Schema.boolean()
		.default(true)
		.description(
			"插件重启后，如果订阅的主播正在直播，是否进行一次推送，默认开启",
		),

	pushTime: Schema.number()
		.min(0)
		.max(12)
		.step(0.5)
		.default(1)
		.description("设定间隔多长时间推送一次直播状态，单位为小时，默认为一小时"),

	customLiveStart: Schema.string()
		.default("-name开播啦，当前粉丝数：-follower\\n-link")
		.description(
			"自定义开播提示语，-name代表UP昵称，-follower代表当前粉丝数，-link代表直播间链接（如果使用的是QQ官方机器人，请不要使用），\\n为换行。例如-name开播啦，会发送为xxxUP开播啦",
		),

	customLive: Schema.string()
		.default("-name正在直播，目前已播-time，累计观看人数：-watched\\n-link")
		.description(
			"自定义直播中提示语，-name代表UP昵称，-time代表开播时长，-watched代表累计观看人数，-link代表直播间链接（如果使用的是QQ官方机器人，请不要使用），\\n为换行。例如-name正在直播，会发送为xxxUP正在直播xxx",
		),

	customLiveEnd: Schema.string()
		.default("-name下播啦，本次直播了-time，粉丝数变化-follower_change")
		.description(
			"自定义下播提示语，-name代表UP昵称，-follower_change代表本场直播粉丝数变，-time代表开播时长，\\n为换行。例如-name下播啦，本次直播了-time，会发送为xxxUP下播啦，直播时长为xx小时xx分钟xx秒",
		),

	followerDisplay: Schema.boolean()
		.default(true)
		.description("粉丝数变化和累积观看本场直播的人数是否显示在推送卡片中"),

	hideDesc: Schema.boolean()
		.default(false)
		.description("是否隐藏UP主直播间简介，开启后推送的直播卡片将不再展示简介"),

	style: Schema.object({}).description("美化设置"),

	removeBorder: Schema.boolean().default(false).description("移除推送卡片边框"),

	cardColorStart: Schema.string()
		.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
		.default("#F38AB5")
		.description(
			"推送卡片的开始渐变背景色，请填入16进制颜色代码，参考网站：https://webkul.github.io/coolhue/",
		),

	cardColorEnd: Schema.string()
		.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
		.default("#F9CCDF")
		.description(
			"推送卡片的结束渐变背景色，请填入16进制颜色代码，参考网站：https://colorate.azurewebsites.net/",
		),

	cardBasePlateColor: Schema.string()
		.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
		.default("#FFF5EE")
		.description("推送卡片底板颜色，请填入16进制颜色代码"),

	cardBasePlateBorder: Schema.string()
		.pattern(/\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax)/)
		.default("15px")
		.description("推送卡片底板边框宽度，请填入css单位，例如1px，12.5rem，100%"),

	enableLargeFont: Schema.boolean()
		.default(false)
		.description(
			"是否开启动态推送卡片大字体模式，默认为小字体。小字体更漂亮，但阅读比较吃力，大字体更易阅读，但相对没这么好看",
		),

	font: Schema.string().description(
		"推送卡片的字体样式，如果你想用你自己的字体可以在此填写，例如：Microsoft YaHei",
	),

	filter: Schema.intersect([
		Schema.object({
			enable: Schema.boolean()
				.default(false)
				.description("是否开启动态屏蔽功能"),
		}).description("屏蔽设置"),
		Schema.union([
			Schema.object({
				enable: Schema.const(true).required(),
				notify: Schema.boolean()
					.default(false)
					.description("动态被屏蔽是否发送提示"),
				regex: Schema.string().description("正则表达式屏蔽"),
				keywords: Schema.array(String).description(
					"关键字屏蔽，一个关键字为一项",
				),
				forward: Schema.boolean()
					.default(false)
					.description("是否屏蔽转发动态"),
				article: Schema.boolean().default(false).description("是否屏蔽专栏"),
			}),
			Schema.object({}),
		]),
	]),

	debug: Schema.object({}).description("调试设置"),

	dynamicDebugMode: Schema.boolean()
		.default(false)
		.description(
			"动态调试模式，开启后会在控制台输出动态推送的详细信息，用于调试",
		),
});
