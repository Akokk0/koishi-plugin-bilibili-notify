// biome-ignore assist/source/organizeImports: <import types only>
import { h } from "koishi";
import type { LiveUsers } from "../type";
import { withRetry } from "../utils";
import { GuardLevel } from "blive-message-listener";
import { BilibiliNotifyLive } from "../core";
import type { BilibiliNotifySub } from "../core";

export default function (this: BilibiliNotifySub) {
	const biliCom = this.ctx.command("bili", "bili-notify插件相关指令", {
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
			await this.ctx["bilibili-notify-push"].sendPrivateMsg("测试消息");
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
			} = (await this.ctx[
				"bilibili-notify-api"
			].getTheUserWhoIsLiveStreaming()) as {
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
		const { data } = await this.ctx["bilibili-notify-api"].v_voucherCaptcha(
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
		const { data: validateCaptchaData } = await this.ctx[
			"bilibili-notify-api"
		].validateCaptcha(data.geetest.challenge, data.token, validate, seccode);
		// 判断验证是否成功
		if (validateCaptchaData?.is_valid !== 1) return "验证失败，请重试";
		// Sleep
		await this.ctx.sleep(10 * 1000);
		// 再次请求
		const { code: validCode, data: validData } = await this.ctx[
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

	biliCom.subcommand(".sc").action(async ({ session }) => {
		const buffer = await this.ctx["bilibili-notify-generate-img"].generateSCImg(
			{
				senderFace:
					"data:image/jpeg;base64,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",
				senderName: "测试用户",
				masterName: "测试主播",
				text: "这是一个超级聊天的测试消息，祝你天天开心，万事如意！",
				price: 2000,
				masterAvatarUrl:
					"data:image/png;base64,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",
			},
		);

		await session.send(h.image(buffer, "image/jpeg"));
	});

	biliCom.subcommand(".nc").action(async ({ session }) => {
		const buffer =
			await this.ctx["bilibili-notify-generate-img"].generateLiveImgTest();

		await session.send(h.image(buffer, "image/jpeg"));
	});
}
