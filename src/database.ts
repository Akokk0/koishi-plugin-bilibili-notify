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
    video: number,
    live: number,
    targetId: string,
    platform: string,
    time: Date
}

export interface LoginBili {
    id: number,
    bili_cookies: string,
    bili_refresh_token: string
}

export const name = 'Database'

export function apply(ctx: Context) {
    // 新增LoginBili表
    ctx.model.extend('loginBili', {
        id: 'unsigned',
        bili_cookies: 'text',
        bili_refresh_token: 'text'
    })

    // 新增Bilibili表
    ctx.model.extend('bilibili', {
        id: 'unsigned',
        uid: 'string',
        room_id: 'string',
        dynamic: 'unsigned',
        video: 'unsigned',
        live: 'unsigned',
        targetId: 'string',
        platform: 'string',
        time: 'timestamp'
    }, { autoInc: true })
}