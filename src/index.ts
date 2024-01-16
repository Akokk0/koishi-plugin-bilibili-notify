import { Context, Schema } from 'koishi'
// import crypto
// import crypto from 'crypto'
// import plugins
// import Authority from './authority'
import ComRegister from './comRegister'
import * as Database from './database'
// import Service
import Wbi from './wbi'
import GenerateImg from './generateImg'
import BiliAPI from './biliAPI'

export const inject = ['puppeteer', 'database']

export const name = 'bilibili-notify'

export interface Config {
  pushTime: number,
  cardColorStart: string,
  cardColorEnd: string,
  key: string
}

export const Config: Schema<Config> = Schema.object({
  pushTime: Schema.number()
    .min(0)
    .max(12)
    .step(0.5)
    .default(1)
    .description('设定隔多长时间推送一次直播状态，单位为小时，默认为一小时'),

  cardColorStart: Schema.string()
    .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .default('#F38AB5')
    .description('推送卡片的开始渐变背景色，请填入16进制颜色代码，参考网站：https://webkul.github.io/coolhue/'),

  cardColorEnd: Schema.string()
    .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .default('#F9CCDF')
    .description('推送卡片的结束渐变背景色，请填入16进制颜色代码，参考网站：https://colorate.azurewebsites.net/'),

  key: Schema.string()
    .pattern(/^[0-9a-f]{32}$/)
    .role('secret')
    .required()
    .description('请输入一个32位小写字母的十六进制密钥（例如：9b8db7ae562b9864efefe06289cc5530），使用此密钥将你的B站登录信息存储在数据库中，请一定保存好此密钥。如果你忘记了此密钥，必须重新登录。你可以自行生成，或到这个网站生成：https://www.sexauth.com/')
})

export function apply(ctx: Context, config: Config) {
  // load database
  ctx.plugin(Database)
  // Regist server
  ctx.plugin(Wbi, { key: config.key })
  ctx.plugin(GenerateImg, { cardColorStart: config.cardColorStart, cardColorEnd: config.cardColorEnd })
  ctx.plugin(BiliAPI)
  // load plugin
  // ctx.plugin(Authority)
  ctx.plugin(ComRegister, { pushTime: config.pushTime })

  // 当用户输入“恶魔兔，启动！”时，执行 help 指令
  ctx.middleware((session, next) => {
    if (session.content === '恶魔兔，启动！') {
      return session.execute('help', next)
    } else {
      return next()
    }
  })
}

/* function generateKey(): string {
  return crypto.randomBytes(32).toString('hex');
} */
