import { Context } from "koishi"

declare module 'koishi' {
    interface Tables {
        bilibili: Bilibili,
        loginBili: LoginBili
    }
}

export interface Bilibili {
    id: number,
    uid: string,
    room_id: string,
    dynamic: number,
    live: number,
    target: string,
    platform: string,
    time: Date
}

export interface LoginBili {
    id: number,
    bili_cookies: string,
    bili_refresh_token: string,
    dynamic_group_id: string
}

export const name = 'Database'

export function apply(ctx: Context) {
    // 新增Bilibili表
    ctx.model.extend('bilibili', {
        id: 'unsigned',
        uid: 'string',
        room_id: 'string',
        dynamic: 'unsigned',
        live: 'unsigned',
        target: 'string',
        platform: 'string',
        time: 'timestamp'
    }, { autoInc: true })

    // 新增LoginBili表
    ctx.model.extend('loginBili', {
        id: 'unsigned',
        bili_cookies: 'text',
        bili_refresh_token: 'text',
        dynamic_group_id: 'string'
    })
}
