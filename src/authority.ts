import { Context } from "koishi";

class Authority {
    constructor(ctx: Context) {
        // 授予权限
        ctx.permissions.provide('qqguild.admin', async (name, session) => {
            return session.event.user.id === '12814193631283946447'
        })
    }
}

export default Authority