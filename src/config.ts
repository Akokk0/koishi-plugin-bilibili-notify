import { Schema } from "koishi";

export interface BAConfig {
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	require: {};
	key: string;
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	master: {};
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	basicSettings: {};
	userAgent: string;
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	subTitle: {};
	sub: Array<{
		name: string;
		uid: string;
		dynamic: boolean;
		live: boolean;
		// biome-ignore lint/complexity/noBannedTypes: <obj>
		card: {};
		// biome-ignore lint/complexity/noBannedTypes: <obj>
		liveMsg: {};
		target: Array<{
			channelArr: Array<{
				channelId: string;
				dynamic: boolean;
				live: boolean;
				liveGuardBuy: boolean;
				atAll: boolean;
				bot: string;
			}>;
			platform: string;
		}>;
	}>;
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	dynamic: {};
	dynamicUrl: boolean;
	dynamicCron: string;
	dynamicVideoUrlToBV: boolean;
	pushImgsInDynamic: boolean;
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	live: {};
	liveDetectType: "WS" | "API";
	restartPush: boolean;
	pushTime: number;
	customLiveStart: string;
	customLive: string;
	customLiveEnd: string;
	followerDisplay: boolean;
	hideDesc: boolean;
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	style: {};
	removeBorder: boolean;
	cardColorStart: string;
	cardColorEnd: string;
	cardBasePlateColor: string;
	cardBasePlateBorder: string;
	enableLargeFont: boolean;
	font: string;
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	filter: {};
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
					"是否开启主人账号功能，如果您的机器人没有私聊权限请不要开启此功能。开启后如果机器人运行错误会向您进行报告",
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
				]).description(
					"请选择您的私人机器人平台，目前支持QQ、QQ群、OneBot、Discord、RedBot、Telegram、Satori、ChronoCat、Lark。从2.0版本开始，只能在一个平台下使用本插件",
				),
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

	subTitle: Schema.object({}).description("订阅配置"),

	sub: Schema.array(
		Schema.object({
			name: Schema.string().description(
				"订阅用户昵称，只是给你自己看的(相当于备注)，可填可不填",
			),
			uid: Schema.string().required().description("订阅用户UID"),
			dynamic: Schema.boolean().default(false).description("是否订阅用户动态"),
			live: Schema.boolean().default(false).description("是否订阅用户直播"),
			target: Schema.array(
				Schema.object({
					platform: Schema.string()
						.required()
						.description("推送平台，例如onebot、qq、discord"),
					channelArr: Schema.array(
						Schema.object({
							channelId: Schema.string().required().description("频道/群组号"),
							dynamic: Schema.boolean()
								.default(false)
								.description("该频道/群组是否推送动态信息"),
							live: Schema.boolean()
								.default(false)
								.description("该频道/群组是否推送直播通知"),
							liveGuardBuy: Schema.boolean()
								.default(false)
								.description("该频道/群组是否推送上舰消息"),
							atAll: Schema.boolean()
								.default(false)
								.description("推送开播通知时是否艾特全体成员"),
							bot: Schema.string().description(
								"若您有多个相同平台机器人，可在此填写当前群聊执行推送的机器人账号。不填则默认第一个",
							),
						}),
					)
						.role("table")
						.required()
						.description("需推送的频道/群组详细设置"),
				}),
			).description(
				"订阅用户需要发送的平台和频道/群组信息(一个平台下可以推送多个频道/群组)",
			),
			liveMsg: Schema.intersect([
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
			card: Schema.intersect([
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
		}).collapse(),
	)
		.collapse()
		.description(
			"输入订阅信息，自定义订阅内容； uid: 订阅用户UID，dynamic: 是否需要订阅动态，live: 是否需要订阅直播",
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

	liveDetectType: Schema.union([
		Schema.const("WS").description(
			"使用WebSocket连接到B站消息服务器进行直播检测，推荐使用",
		),
		Schema.const("API")
			.description(
				"通过轮询API发送请求监测直播状态，此模式理论可无限订阅，但容易产生其他问题，功能没有WS模式全面",
			)
			.experimental(),
	])
		.role("radio")
		.default("WS")
		.description(
			"直播检测方式，WS为连接到B站消息服务器，API为通过轮询发送请求监测，默认使用WS检测",
		),

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
				enable: Schema.const(true).required().experimental(),
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
