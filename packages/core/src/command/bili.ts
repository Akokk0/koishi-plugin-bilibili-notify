// biome-ignore assist/source/organizeImports: <import types only>
import { type Context, h } from "koishi";
import type { LiveUsers } from "../type";
import { withRetry } from "../utils";
import { GuardLevel } from "blive-message-listener";
import BilibiliNotifyLive from "../core/live";

export default function (ctx: Context) {
	const biliCom = ctx.command("bili", "bili-notify插件相关指令", {
		permissions: ["authority:3"],
	});

	biliCom
		.subcommand(".list", "展示订阅对象")
		.usage("展示订阅对象")
		.example("bili list")
		.action(() => {
			const subTable = this.subShow();
			return subTable;
		});

	biliCom
		.subcommand(".private", "向管理员账号发送一条测试消息", { hidden: true })
		.usage("向管理员账号发送一条测试消息")
		.example("bili private 向管理员账号发送一条测试消息")
		.action(async ({ session }) => {
			// 发送消息
			await this.sendPrivateMsg("测试消息");
			// 发送提示
			await session.send(
				"已发送测试消息。如果未收到，可能是机器人不支持发送私聊消息或配置信息有误",
			);
		});

	biliCom
		.subcommand(".ll")
		.usage("展示当前正在直播的订阅对象")
		.example("bili ll")
		.action(async () => {
			// 获取liveUsers
			const {
				data: { live_users },
			} = (await ctx["bilibili-notify-api"].getTheUserWhoIsLiveStreaming()) as {
				data: { live_users: LiveUsers };
			};
			// 定义当前正在直播且订阅的UP主列表
			const subLiveUsers: Array<{
				uid: number;
				uname: string;
				onLive: boolean;
			}> = [];
			// 判断是否存在live_users
			if (live_users?.items) {
				// 获取当前订阅的UP主
				for (const [uid, sub] of this.subManager) {
					// 定义开播标志位
					let onLive = false;
					// 遍历liveUsers
					for (const user of live_users.items) {
						// 判断是否是订阅直播的UP
						if (user.mid.toString() === uid && sub.live) {
							// 设置标志位为true
							onLive = true;
							// break
							break;
						}
					}
					// 判断是否未开播
					subLiveUsers.push({
						uid: Number.parseInt(uid, 10),
						uname: sub.uname,
						onLive,
					});
				}
			}
			// 定义table字符串
			let table = "";
			// 遍历liveUsers
			if (subLiveUsers.length === 0) {
				table += "当前没有正在直播的订阅对象";
			} else {
				for (const user of subLiveUsers) {
					table += `[UID:${user.uid}] 「${user.uname}」 ${user.onLive ? "正在直播" : "未开播"}\n`;
				}
			}
			return table;
		});

	biliCom
		.subcommand(".dyn <uid:string> [index:number]", "手动推送一条动态信息", {
			hidden: true,
		})
		.usage("手动推送一条动态信息")
		.example("bili dyn 233 1 手动推送UID为233用户空间的第一条动态信息")
		.action(async ({ session }, uid, index) => {
			// 获取index
			const i = (index && index - 1) || 0;
			// 获取动态
			const content =
				await this.ctx["bilibili-notify-api"].getUserSpaceDynamic(uid);
			// 判断content是否存在
			if (!content || !content.data) {
				this.logger.error("获取动态内容失败");
				return;
			}
			if (content.code !== 0) {
				this.logger.error(`获取动态内容失败，错误码: ${content.code}`);
				return;
			}
			// 获取动态内容
			const item = content.data.items[i];
			// 生成图片
			const buffer = await withRetry(async () => {
				// 渲染图片
				return await this.ctx[
					"bilibili-notify-generate-img"
				].generateDynamicImg(item);
			}, 1).catch(async (e) => {
				// 直播开播动态，不做处理
				if (e.message === "直播开播动态，不做处理") {
					await session.send("发现直播开播动态，跳过处理");
					return;
				}
				if (e.message === "出现关键词，屏蔽该动态") {
					await session.send("已屏蔽含有关键词的动态");
					return;
				}
				if (e.message === "已屏蔽转发动态") {
					await session.send("已屏蔽转发动态");
					return;
				}
				if (e.message === "已屏蔽专栏动态") {
					await session.send("已屏蔽专栏动态");
					return;
				}
				// 未知错误
				this.logger.error(`生成动态图片失败：${e.message}`);
			});
			// 发送图片
			buffer && (await session.send(h.image(buffer, "image/jpeg")));
		});

	biliCom.subcommand(".wc").action(async ({ session }) => {
		const words: Array<[string, number]> = [
			["摆烂", 91],
			["可以", 82],
			["可以", 72],
			["可以", 42],
			["dog", 40],
			["dog", 40],
			["不是", 37],
			["不是", 37],
			["就是", 27],
			["就是", 27],
			["吃瓜", 16],
			["吃瓜", 16],
			["吃瓜", 16],
			["cj", 8],
			["cj", 8],
			["cj", 8],
			["没有", 8],
			["没有", 8],
			["没有", 8],
			["有点", 8],
			["有点", 8],
			["喜欢", 7],
			["喜欢", 7],
			["空调", 7],
			["空调", 7],
			["空调", 7],
			["感觉", 7],
			["感觉", 7],
			["感觉", 7],
			["时候", 6],
			["时候", 6],
			["怎么", 6],
			["怎么", 6],
			["痛车", 6],
			["痛车", 6],
			["一下", 6],
			["一下", 6],
			["还是", 6],
			["还是", 6],
			["麻麻", 6],
			["麻麻", 6],
			["下午", 5],
			["下午", 5],
			["开始", 5],
			["开始", 5],
			["一部", 5],
			["一部", 5],
			["这样", 5],
			["这样", 5],
			["上次", 5],
			["上次", 5],
			["游戏", 5],
			["游戏", 5],
			["这边", 5],
			["这边", 5],
			["问号", 5],
			["问号", 5],
			["好看", 5],
			["好看", 5],
			["哈哈哈", 5],
			["哈哈哈", 5],
			["角色", 5],
			["角色", 5],
			["味道", 5],
			["味道", 5],
			["233333", 4],
			["233333", 4],
			["老规矩", 4],
			["老规矩", 4],
			["鸣潮", 4],
			["鸣潮", 4],
			["养生", 4],
			["养生", 4],
			["划掉", 4],
			["划掉", 4],
			["排队", 4],
			["排队", 4],
			["cos", 4],
			["cos", 4],
			["的话", 4],
			["的话", 4],
			["我们", 4],
			["主要", 4],
			["www", 4],
			["直接", 4],
			["不好", 4],
			["学校", 4],
			["一样", 4],
			["初中", 4],
			["毕业", 4],
		];

		const img = h.image(
			await this.ctx["bilibili-notify-generate-img"].generateWordCloudImg(
				words,
				"词云测试",
			),
			"image/jpg",
		);

		const top5DanmakuMaker = [
			["张三", 60],
			["李四", 48],
			["王五", 45],
			["赵六", 27],
			["田七", 25],
		];

		const summary = this.config.liveSummary
			.join("\n")
			.replace("-dmc", "114")
			.replace("-mdn", "特工")
			.replace("-dca", "514")
			.replace("-un1", `${top5DanmakuMaker[0][0]}`)
			.replace("-dc1", `${top5DanmakuMaker[0][1]}`)
			.replace("-un2", `${top5DanmakuMaker[1][0]}`)
			.replace("-dc2", `${top5DanmakuMaker[1][1]}`)
			.replace("-un3", `${top5DanmakuMaker[2][0]}`)
			.replace("-dc3", `${top5DanmakuMaker[2][1]}`)
			.replace("-un4", `${top5DanmakuMaker[3][0]}`)
			.replace("-dc4", `${top5DanmakuMaker[3][1]}`)
			.replace("-un5", `${top5DanmakuMaker[4][0]}`)
			.replace("-dc5", `${top5DanmakuMaker[4][1]}`)
			.replaceAll("\\n", "\n");

		await session.send(h("message", [img, h.text(summary)]));
	});

	biliCom.subcommand(".cap").action(async ({ session }) => {
		const { code: userInfoCode, data: userInfoData } = await withRetry(
			async () => {
				// 获取用户信息
				const data =
					await this.ctx["bilibili-notify-api"].getUserInfo("114514");
				// 返回用户信息
				return { code: 0, data };
			},
		).then((content) => content.data);
		// 判断是否满足风控条件
		if (userInfoCode !== -352 || !userInfoData.v_voucher)
			return "不满足验证条件，无需执行。如果提示风控，请尝试重启插件";
		// 开始进行风控验证
		const { data } = await ctx["bilibili-notify-api"].v_voucherCaptcha(
			userInfoData.v_voucher,
		);
		// 判断是否能进行风控验证
		if (!data.geetest) {
			return "当前风控无法通过验证解除，可能需要人工申诉";
		}
		// 发送提示消息消息
		await session.send(
			"请到这个网站进行验证操作：https://kuresaru.github.io/geetest-validator/",
		);
		await session.send(
			"请手动填入 gt 和 challenge，然后点击生成进行验证。验证完成后再点击结果，并根据提示输入对应的 validate",
		);
		// gt 和 challenge
		await session.send(`gt:${data.geetest.gt}`);
		await session.send(`challenge:${data.geetest.challenge}`);
		// 发送等待输入消息 validate
		await session.send("验证完成，请直接输入 validate");
		// 等待输入
		const validate = await session.prompt();
		// seccode
		const seccode = `${validate}|jordan`;
		// 验证结果
		const { data: validateCaptchaData } = await ctx[
			"bilibili-notify-api"
		].validateCaptcha(data.geetest.challenge, data.token, validate, seccode);
		// 判断验证是否成功
		if (validateCaptchaData?.is_valid !== 1) return "验证失败，请重试";
		// Sleep
		await this.ctx.sleep(10 * 1000);
		// 再次请求
		const { code: validCode, data: validData } = await ctx[
			"bilibili-notify-api"
		].getUserInfo("114514", validateCaptchaData.grisk_id);
		// 再次验证
		if (validCode === -352 && validData.v_voucher) return "验证失败，请重试";
		// 验证成功
		await session.send("验证成功！请重启插件以继续工作");
	});

	biliCom.subcommand(".ai").action(async () => {
		this.logger.debug("开始生成AI直播总结");

		const liveSummaryData = {
			medalName: "特工",
			danmakuSenderCount: "56",
			danmakuCount: "778",
			top5DanmakuSender: [
				["张三", 71],
				["李四", 67],
				["王五", 57],
				["赵六", 40],
				["田七", 31],
			],
			top10Word: [
				["摆烂", 91],
				["可以", 82],
				["dog", 40],
				["不是", 37],
				["就是", 27],
				["吃瓜", 16],
				["cj", 8],
				["没有", 8],
				["有点", 8],
				["喜欢", 7],
				["空调", 7],
			],
			liveStartTime: "2025-07-21 12:56:05",
			liveEndTime: "2025-07-21 15:40:30",
		};

		const res = await this.ctx["bilibili-notify-api"].chatWithAI(
			`请你生成直播总结，用这样的风格，多使用emoji并且替换示例中的emoji，同时要对每个人进行个性化点评，一下是风格参考：
                    🔍【弹幕情报站】本场直播数据如下：
                    🧍‍♂️ 总共 XX 位 (这里用medalName) 上线
                    💬 共计 XXX 条弹幕飞驰而过
                    📊 热词云图已生成，快来看看你有没有上榜！
                    👑 本场顶级输出选手：
                    🥇 XXX - 弹幕输出 XX 条，(这里进行吐槽)  
                    🥈 XXX - 弹幕 XX 条，(这里进行吐槽)    
                    🥉 XXX - 弹幕 XX 条，(这里进行吐槽)  
                    🎖️ 特别嘉奖：XXX（这里进行吐槽） & XXX（这里进行吐槽）。  
                    别以为发这么点弹幕就能糊弄过去，本兔可是盯着你们的！下次再偷懒小心被我踹飞！🐰🥕
    
                    以下是直播数据：${JSON.stringify(liveSummaryData)}`,
		);

		this.logger.debug("AI 生成完毕，结果为：");
		this.logger.debug(res.choices[0].message.content);
	});

	biliCom.subcommand(".img").action(async ({ session }) => {
		// 舰长图片
		const guardImg = BilibiliNotifyLive.GUARD_LEVEL_IMG[GuardLevel.Jianzhang];
		const buffer = await this.ctx[
			"bilibili-notify-generate-img"
		].generateBoardingImg(
			guardImg,
			{
				guardLevel: GuardLevel.Jianzhang,
				face: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQSESgEED4WoyK9O5FFgrV8cHZPM4w4JgleZQ&s",
				uname: "恶魔兔",
				isAdmin: 1,
			},
			{
				masterName: "籽岷",
				masterAvatarUrl:
					"https://img.touxiangkong.com/uploads/allimg/20203301251/2020/3/BjEbyu.jpg",
			},
		);
		await session.send(h.image(buffer, "image/jpeg"));
	});
}
