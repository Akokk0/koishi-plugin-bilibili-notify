import { Context } from "koishi";

class Authority {
    constructor(ctx: Context) {
        // 授予权限
        /* ctx.permissions.provide('telegram:admin', async (name, session) => {
            console.log(session);
            return session.telegram?.sender?.role === 'admin'
        }) */
    }
}

export default Authority