import type { BilibiliNotifySub } from "../core";

export default function (this: BilibiliNotifySub) {
	const statusCom = this.ctx.command("status", "插件状态相关指令", {
		permissions: ["authority:5"],
	});

	statusCom
		.subcommand(".dyn", "查看动态监测运行状态")
		.usage("查看动态监测运行状态")
		.example("status dyn")
		.action(() => {
			if (this.ctx["bilibili-notify-dynamic"].isActive) {
				return "动态监测正在运行";
			}
			return "动态监测未运行";
		});

	statusCom
		.subcommand(".sm", "查看订阅管理对象")
		.usage("查看订阅管理对象")
		.example("status sm")
		.action(async () => {
			this.logger.info(this.subManager);
			return "查看控制台";
		});

	statusCom
		.subcommand(".bot", "查询当前拥有的机器人信息", { hidden: true })
		.usage("查询当前拥有的机器人信息")
		.example("status bot 查询当前拥有的机器人信息")
		.action(() => {
			this.logger.debug("开始输出BOT信息");
			for (const bot of this.ctx.bots) {
				this.logger.debug("--------------------------------");
				this.logger.debug(`平台：${bot.platform}`);
				this.logger.debug(`名称：${bot.user.name}`);
				this.logger.debug("--------------------------------");
			}
		});

	statusCom
		.subcommand(".env", "查询当前环境的信息", { hidden: true })
		.usage("查询当前环境的信息")
		.example("status env 查询当前环境的信息")
		.action(async ({ session }) => {
			await session.send(`Guild ID:${session.event.guild.id}`);
			await session.send(`Channel ID: ${session.event.channel.id}`);
		});
}
