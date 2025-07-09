import type { Context } from "koishi";

declare module "koishi" {
	interface Tables {
		loginBili: LoginBili;
	}
}

export interface LoginBili {
	id: number;
	bili_cookies: string;
	bili_refresh_token: string;
	dynamic_group_id: string;
}

export const name = "Database";

export function apply(ctx: Context) {
	// 新增LoginBili表
	ctx.model.extend("loginBili", {
		id: "unsigned",
		bili_cookies: "text",
		bili_refresh_token: "text",
		dynamic_group_id: "string",
	});
}
