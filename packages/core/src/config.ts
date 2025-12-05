import { Schema } from "koishi";

export interface BAConfig {
	// TODO: improve type
	// biome-ignore lint/complexity/noBannedTypes: <obj>
	require: {};
	key: string;
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
	master: {};
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
	require: Schema.object({}).description(
		"这里是主人的必填设置哟（；>_<）女仆会乖乖等主人填好再继续的～",
	),

	key: Schema.string()
		.pattern(/^[0-9a-f]{32}$/)
		.role("secret")
		.required()
		.description(
			"请主人输入一个 32 位的小写十六进制密钥喔 ( >﹏< )这个密钥会用来把主人的 B 站登录信息安全保存到数据库里～请一定一定要好好保管，不然忘掉了就要重新登录了啦 (；´д｀)ゞ主人也可以去这个网站生成密钥：https://www.sexauth.com/",
		),

	subTitle: Schema.object({}).description(
		"订阅相关的配置都在这里～主人要订阅什么，女仆都负责帮您记好 (｡>﹏<｡)！",
	),

	advancedSub: Schema.boolean()
		.default(false)
		.description(
			"这个开关决定是否使用高级订阅功能喔～如果主人想要超级灵活的订阅内容，就请开启并安装 bilibili-notify-advanced-subscription 呀 (๑•̀ㅂ•́)و♡",
		),

	subs: Schema.array(
		Schema.object({
			name: Schema.string().required().description("UP昵称"),
			uid: Schema.string().required().description("UID & roomid"),
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
			"在这里填写主人的订阅信息～UP 昵称、UID、roomid、平台、群号都要填正确，不然女仆会迷路哒 (；>_<)如果多个群聊/频道，请用英文逗号分隔哦～女仆会努力送到每一个地方的！",
		),

	basicSettings: Schema.object({}).description(
		"这是主人最基本的设置区域哒～女仆会乖乖等主人安排 (*´∀`)~♡",
	),

	userAgent: Schema.string().description(
		"这里可以设置请求头的 User-Agent 哦～如果请求出现了 -352 的奇怪错误，主人可以试着在这里换一个看看 (；>_<)UA 获取方法可以参考说明里的链接喔～ https://blog.csdn.net/qq_44503987/article/details/104929111",
	),

	ai: Schema.intersect([
		Schema.object({
			enable: Schema.boolean()
				.default(false)
				.description(
					"要不要让女仆打开 AI 小脑袋呢？(〃ﾉωﾉ) 开了之后就能帮主人做更多事情啦！",
				),
		}),
		Schema.union([
			Schema.object({
				enable: Schema.const(true).required(),
				apiKey: Schema.string()
					.role("secret")
					.required()
					.description("请主人把 API Key 告诉女仆……会乖乖保护好的 (つ﹏⊂)♡"),
				baseURL: Schema.string()
					.required()
					.description(
						"AI 的访问地址在这里填哦～女仆会按照主人的指令去联络 AI 的 (*>ω<)b",
					),
				model: Schema.string()
					.default("gpt-3.5-turbo")
					.description(
						"请选择主人想用的 AI 模型～女仆会按主人的喜欢来工作的(〃´-`〃)♡",
					),
				persona: Schema.string()
					.description(
						"这是 AI 的性格设定哟～主人可以随意决定它是什么样的角色，女仆会认真帮忙传达的 (*´艸`)",
					)
					.default(
						"你是一个风趣幽默的主播助理，你的任务是根据提供的直播数据生成一段有趣且富有创意的直播总结。请确保你的回答简洁明了，避免使用过于复杂的语言或长句子。请注意，你的回答必须与提供的数据相关，并且不能包含任何虚构的信息。如果你无法根据提供的数据生成总结，请礼貌地说明你无法完成任务。",
					),
			}),
			Schema.object({ enable: Schema.const(false) }),
		]),
	]),

	master: Schema.intersect([
		Schema.object({
			enable: Schema.boolean()
				.default(false)
				.description(
					"要不要让笨笨女仆开启主人账号功能呢？(>﹏<)如果机器人遭遇了奇怪的小错误，女仆会立刻跑来向主人报告的！不、不过……如果没有私聊权限的话，女仆就联系不到主人了……请不要打开这个开关喔 (；´д｀)ゞ",
				),
		}).description("主人的特别区域……女仆会乖乖侍奉的！(>///<)"),
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
					"主人想让女仆在哪个平台伺候您呢？请从这里选一个吧～(〃´-`〃)♡女仆会乖乖待在主人选的地方哒！",
				),
				masterAccount: Schema.string()
					.role("secret")
					.required()
					.description(
						"请主人把自己的账号告诉女仆嘛……不然女仆会找不到主人哒 (つ﹏⊂)在 Q 群的话用 QQ 号就可以了～其他平台请用 inspect 插件告诉女仆主人的 ID 哦 (´｡• ᵕ •｡`) ♡",
					),
				masterAccountGuildId: Schema.string()
					.role("secret")
					.description(
						"如果是在 QQ 频道、Discord 这种地方……主人的群组 ID 也要告诉女仆喔 (；>_<)不然女仆会迷路找不到主人……请用 inspect 插件带女仆去看看嘛～(〃ﾉωﾉ)",
					),
			}),
			Schema.object({}),
		]),
	]),

	dynamic: Schema.object({}).description(
		"动态推送的相关设置都在这里，让女仆乖乖监测 UP 动态 (*´∀`)~♡",
	),

	dynamicUrl: Schema.boolean()
		.default(false)
		.description(
			"发送动态时要不要顺便发链接呢？但如果主人用的是 QQ 官方机器人，这个开关不要开喔～不然会出事的 (；>_<)！",
		),

	dynamicCron: Schema.string()
		.default("*/2 * * * *")
		.description(
			"主人想多久检查一次动态呢？这里填写 cron 表达式～太短太频繁会吓到女仆的，请温柔一点 (〃ﾉωﾉ)",
		),

	dynamicVideoUrlToBV: Schema.boolean()
		.default(false)
		.description(
			"如果是视频动态，开启后会把链接换成 BV 号哦～方便主人的其他用途 (*´･ω･`)",
		),

	pushImgsInDynamic: Schema.boolean()
		.default(false)
		.description(
			"要不要把动态里的图片也一起推送呢？但、但是可能会触发 QQ 的风控，女仆会有点害怕 (；>_<) 请主人小心决定…",
		),

	live: Schema.object({}).description(
		"这里是直播相关的设置～女仆会盯紧 UP 的直播情况的 (*>ω<)",
	),

	wordcloudStopWords: Schema.string().description(
		"这里可以填写词云生成时要忽略的词～用英文逗号分隔哦！女仆会乖乖把这些词过滤掉的 (๑•̀ㅂ•́)و✧",
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
			"这里可以自定义直播总结的模版～每一行就是一段内容，女仆会按主人写的格式发送哦 (〃´-`〃)♡变量说明也在下面，主人随意发挥吧！变量解释：-dmc代表总弹幕发送人数，-mdn代表主播粉丝牌子名，-dca代表总弹幕数，-un1到-un5代表弹幕发送条数前五名用户的用户名，-dc1到-dc5代表弹幕发送条数前五名的弹幕发送数量，数组每一行代表换行",
		),

	customGuardBuy: Schema.intersect([
		Schema.object({
			enable: Schema.boolean()
				.default(false)
				.description("要不要让女仆开启自定义上舰消息呢？(ﾟ▽ﾟ)"),
		}),
		Schema.union([
			Schema.object({
				enable: Schema.const(true).required(),
				guardBuyMsg: Schema.string()
					.default("【-mname的直播间】-uname加入了大航海（-guard）")
					.description(
						"这里可以自定义上舰提示内容～-uname 是用户名，-muname 是主播名，-guard 是舰长类型哒！女仆会甜甜地发送给主人的群里 (〃ﾉωﾉ)♡",
					),
				captainImgUrl: Schema.string()
					.default(
						"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/captain-Bjw5Byb5.png",
					)
					.description(
						"舰长图片链接，这是对应舰长阶级的图片链接～女仆会把它贴在推送里，让消息更好看(*´∀`)~♡",
					),
				supervisorImgUrl: Schema.string()
					.default(
						"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/supervisor-u43ElIjU.png",
					)
					.description(
						"提督图片链接，这是对应舰长阶级的图片链接～女仆会把它贴在推送里，让消息更好看(*´∀`)~♡",
					),
				governorImgUrl: Schema.string()
					.default(
						"https://s1.hdslb.com/bfs/static/blive/live-pay-mono/relation/relation/assets/governor-DpDXKEdA.png",
					)
					.description(
						"总督图片链接，这是对应舰长阶级的图片链接～女仆会把它贴在推送里，让消息更好看(*´∀`)~♡",
					),
			}),
			Schema.object({}) as Schema<Partial<BAConfig>>,
		]),
	]),

	restartPush: Schema.boolean()
		.default(true)
		.description(
			"插件重启后，如果 UP 正在直播，要不要马上推送一次呢？默认是会推送的～女仆会第一时间报告给主人的！",
		),

	pushTime: Schema.number()
		.min(0)
		.max(12)
		.step(0.5)
		.default(1)
		.description(
			"主人想多长时间推送一次直播状态呢？单位是小时，女仆会按主人的节奏努力工作的 (๑•̀ㅂ•́)و✧",
		),

	customLiveStart: Schema.string()
		.default("-name开播啦，当前粉丝数：-follower\\n-link")
		.description(
			"这是开播提示语的自定义格式～女仆会把 -name、-follower、-link 都替换成真实数据送给主人 (〃´-`〃)♡，-name代表UP昵称，-follower代表当前粉丝数，-link代表直播间链接（如果使用的是QQ官方机器人，请不要使用），\\n为换行。例如-name开播啦，会发送为xxxUP开播啦",
		),

	customLive: Schema.string()
		.default("-name正在直播，目前已播-time，累计观看人数：-watched\\n-link")
		.description(
			"直播中提示语的自定义内容在这里～-name、-time、-watched 都会由女仆乖乖替换哒！-name代表UP昵称，-time代表开播时长，-watched代表累计观看人数，-link代表直播间链接（如果使用的是QQ官方机器人，请不要使用），\\n为换行。例如-name正在直播，会发送为xxxUP正在直播xxx",
		),

	customLiveEnd: Schema.string()
		.default("-name下播啦，本次直播了-time，粉丝数变化-follower_change")
		.description(
			"下播提示语的设定～-time、-follower_change 等变量女仆都会帮主人处理好 (*´∀`)，-name代表UP昵称，-follower_change代表本场直播粉丝数变，-time代表开播时长，\\n为换行。例如-name下播啦，本次直播了-time，会发送为xxxUP下播啦，直播时长为xx小时xx分钟xx秒",
		),

	followerDisplay: Schema.boolean()
		.default(true)
		.description(
			"要不要显示粉丝变化和累计观看人数在推送卡片呢？女仆可以帮忙统计哒 (๑•̀ㅂ•́)و✧",
		),

	hideDesc: Schema.boolean()
		.default(false)
		.description("开启后会隐藏直播间简介～让推送卡片更简洁！女仆会照做的！"),

	style: Schema.object({}).description(
		"这里是美化设置，让女仆把推送卡片变得漂漂亮亮 (〃ﾉωﾉ)♡",
	),

	removeBorder: Schema.boolean()
		.default(false)
		.description("要不要把卡片边框移除呢？女仆可以帮忙裁掉 (｀・ω・´)！"),

	cardColorStart: Schema.string()
		.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
		.default("#F38AB5")
		.description(
			"这是推送卡片的渐变颜色开始设置～主人喜欢什么颜色，女仆就用什么颜色 (〃´-`〃)♡",
		),

	cardColorEnd: Schema.string()
		.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
		.default("#F9CCDF")
		.description(
			"这是推送卡片的渐变颜色结束设置～主人喜欢什么颜色，女仆就用什么颜色 (〃´-`〃)♡”",
		),

	cardBasePlateColor: Schema.string()
		.pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
		.default("#FFF5EE")
		.description("底板的颜色在这里设置～请主人随意挑选喜欢的颜色！"),

	cardBasePlateBorder: Schema.string()
		.pattern(/\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax)/)
		.default("15px")
		.description(
			"底板边框的宽度～请填 CSS 单位喔！女仆会乖乖画出这个边框 (*>ω<)b",
		),

	enableLargeFont: Schema.boolean()
		.default(false)
		.description(
			"要不要开启大字体模式呢？大字体更好读，小字体更可爱……无论哪种女仆都支持主人的选择 (〃ﾉωﾉ)",
		),

	font: Schema.string().description(
		"如果主人想用自己的专属字体，可以在这里填写名字～女仆会努力让推送卡片变得更有主人的风格 (´｡• ᵕ •｡`) ♡",
	),

	filter: Schema.intersect([
		Schema.object({
			enable: Schema.boolean().default(false).description("要开启吗？"),
		}).description(
			"这里是动态屏蔽设置～如果有不想看到的内容，女仆可以帮主人过滤掉 (＞﹏＜)！",
		),
		Schema.union([
			Schema.object({
				enable: Schema.const(true).required(),
				notify: Schema.boolean()
					.default(false)
					.description("当动态被屏蔽时，要不要让女仆通知主人呢？"),
				regex: Schema.string().description(
					"这里可以填写正则表达式，用来屏蔽特定动态～女仆会努力匹配的！",
				),
				keywords: Schema.array(String).description(
					"这里填写关键字，每一个都是单独的一项～有这些词的动态女仆都会贴心地拦下来 (*´∀`)",
				),
				forward: Schema.boolean()
					.default(false)
					.description("要不要屏蔽转发动态呢？主人说了算！"),
				article: Schema.boolean()
					.default(false)
					.description(
						"是否屏蔽专栏动态～女仆会按照主人的喜好来处理 (๑•̀ㅂ•́)و✧",
					),
			}),
			Schema.object({}),
		]),
	]),

	debug: Schema.object({}).description(
		"这里是调试功能区域～如果主人需要排查问题，女仆会乖乖协助 (；>_<)",
	),

	dynamicDebugMode: Schema.boolean()
		.default(false)
		.description(
			"开启后会在控制台输出详细的动态调试信息～主人需要的话女仆会毫不保留全都告诉您！",
		),
});
