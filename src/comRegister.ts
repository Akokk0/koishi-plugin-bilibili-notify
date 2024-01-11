import { Bot, Context, Logger, Schema, Session, h } from "koishi"
// 导入qrcode
import QRCode from 'qrcode'

enum LiveType {
    NotLiveBroadcast,
    StartBroadcasting,
    LiveBroadcast
}

class ComRegister {
    static inject = ['biliAPI', 'gimg', 'wbi', 'database'];
    logger: Logger;
    config: ComRegister.Config
    num: number = 0
    subManager: {
        id: number,
        uid: string,
        roomId: string,
        targetId: string,
        live: boolean,
        dynamic: boolean,
        liveDispose: Function,
        dynamicDispose: Function
    }[] = []

    // QQ群机器人
    qqBot: Bot<Context>
    // QQ频道机器人
    qqguildBot: Bot<Context>

    constructor(ctx: Context, config: ComRegister.Config) {
        this.logger = ctx.logger('commandRegister')
        this.config = config
        // 拿到QQ群机器人
        this.qqBot = ctx.bots[ctx.bots.findIndex(bot => bot.platform === 'qq')]
        // 拿到QQ频道机器人
        this.qqguildBot = ctx.bots[ctx.bots.findIndex(bot => bot.platform === 'qqguild')]

        this.getSubFromDatabase(ctx)

        ctx.command('test')
            .subcommand('.cookies')
            .usage('测试指令，用于测试从数据库读取cookies')
            .action(async () => {
                await ctx.biliAPI.loadCookiesFromDatabase()
            })

        ctx.command('test')
            .subcommand('.my')
            .usage('测试指令，用于测试获取自己信息')
            .example('test.my')
            .action(async () => {
                const content = await ctx.biliAPI.getMyselfInfo()
                console.log(content);
            })

        ctx.command('test')
            .subcommand('.user <mid:string>')
            .usage('测试指令，用于测试获取用户信息')
            .example('test.user 用户UID')
            .action(async (_, mid) => {
                const content = await ctx.biliAPI.getUserInfo(mid)
                console.log(content);
            })

        ctx.command('test')
            .subcommand('.time')
            .usage('测试时间接口')
            .example('test.time')
            .action(async () => {
                const content = await ctx.biliAPI.getTimeNow()
                console.log(content);
            })

        ctx.command('test')
            .subcommand('.exist')
            .usage('测试写法')
            .example('test.exist')
            .action(async () => {
                let num = 1;
                console.log(num && `Hello World`);
            })

        ctx.command('test')
            .subcommand('.gimg <uid:string> <index:number>')
            .usage('测试图片生成')
            .example('test.gimg')
            .action(async (_, uid, index) => {
                // 获取用户空间动态数据
                const { data } = await ctx.biliAPI.getUserSpaceDynamic(uid)
                const [pic] = await ctx.gimg.generateDynamicImg(data.items[index])
                return pic
            })

        ctx.command('test')
            .subcommand('.subm')
            .usage('查看订阅对象状态')
            .example('test subm')
            .action(() => {
                console.log(this.subManager);
            })

        ctx.command('test')
            .subcommand('.group')
            .usage('查看session groupId')
            .example('test group')
            .action(({ session }) => {
                console.log(session.event.channel);
            })

        ctx.command('test')
            .subcommand('.session')
            .usage('查看seesion')
            .example('test session')
            .action(({ session }) => {
                console.log(session);
            })

        ctx.command('bili', 'bili-notify插件相关指令')
            .subcommand('.login', '登录B站之后才可以进行之后的操作')
            .usage('使用二维码登录，登录B站之后才可以进行之后的操作')
            .example('bili login')
            .action(async ({ session }) => {
                this.logger.info('调用bili login指令')
                // 获取二维码
                const content = await ctx.biliAPI.getLoginQRCode()
                // 判断是否出问题
                if (content.code !== 0) return await session.send('出问题咯，请联系管理员解决！')
                // 设置二维码参数
                let options = {
                    errorCorrectionLevel: 'H', // 错误更正水平
                    type: 'image/png',         // 输出类型
                    quality: 0.92,             // 图像质量（仅适用于'image/jpeg'）
                    margin: 1,                 // 边距大小
                    color: {
                        dark: '#000000',         // 二维码颜色
                        light: '#FFFFFF'         // 背景颜色
                    }
                }
                // 生成二维码
                QRCode.toBuffer(content.data.url, options, async (err, buffer) => {
                    if (err) return await session.send('二维码生成出错，请联系管理员解决！')
                    await session.send(h.image(buffer, 'image/png'))
                })
                // 定义定时器
                let dispose;
                // 发起登录请求检查登录状态
                dispose = ctx.setInterval(async () => {
                    const loginContent = await ctx.biliAPI.getLoginStatus(content.data.qrcode_key)
                    if (loginContent.code !== 0) {
                        dispose()
                        return await session.send('登录失败！请联系管理员解决！')
                    }
                    if (loginContent.data.code === 86038) {
                        dispose()
                        return await session.send('二维码已失效，请重新登录！')
                    }
                    if (loginContent.data.code === 0) { // 登录成功
                        const encryptedCookies = ctx.wbi.encrypt(await ctx.biliAPI.getCookies())
                        const encryptedRefreshToken = ctx.wbi.encrypt(loginContent.data.refresh_token)
                        await ctx.database.upsert('loginBili', [{
                            id: 1,
                            bili_cookies: encryptedCookies,
                            bili_refresh_token: encryptedRefreshToken
                        }])
                        dispose()
                        return await session.send('登录成功！')
                    }
                }, 1000)
            })

        ctx.command('bili')
            .subcommand('.unsub <uid:string>')
            .usage('取消订阅')
            .example('bili unsub 用户UID')
            .action(async ({ session }, uid) => {
                this.logger.info('调用bili.unsub指令')
                // 若用户UID为空则直接返回
                if (!uid) return '用户UID不能为空'
                // 定义是否存在
                let exist: boolean
                await Promise.all(this.subManager.map(async (sub, i) => {
                    if (sub.uid === uid) {
                        // 执行dispose方法，销毁定时器
                        this.subManager[i].dynamicDispose()
                        this.subManager[i].liveDispose()
                        // 从数据库中删除订阅
                        await ctx.database.remove('bilibili', { uid: this.subManager[i].uid })
                        // 将该订阅对象从订阅管理对象中移除
                        this.subManager = this.subManager.splice(i, i)
                        // id--
                        this.num--
                        // 发送成功通知
                        session.send('已取消订阅该用户')
                        // 将存在flag设置为true
                        exist = true
                    }
                }))
                // 未订阅该用户，无需取消订阅
                !exist && session.send('未订阅该用户，无需取消订阅')
            })

        ctx.command('bili')
            .subcommand('.show')
            .usage('展示订阅对象')
            .example('bili show')
            .action(async ({ session }) => {
                let table: string = ``
                this.subManager.forEach(sub => {
                    table += 'UID:' + sub.uid + '  RoomID:' + sub.roomId + '\n'
                })
                !table && session.send('没有订阅任何UP')
                table && session.send(table)
            })

        ctx.command('bili')
            .subcommand('.sub <mid:string> [guildId:string]')
            .option('live', '-l')
            .option('dynamic', '-d')
            .usage('订阅用户动态和直播通知，若需要订阅直播请加上-l，需要订阅动态则加上-d。若没有加任何参数，之后会向你单独询问，<>中为必选参数，[]中为可选参数，目标群号若不填，则默认为当前群聊')
            .example('bili sub 用户uid 目标QQ群号(暂不支持) -l -d')
            .action(async ({ session, options }, mid, guildId) => {
                this.logger.info('调用bili.sub指令')
                // 如果订阅人数超过三个则直接返回
                if (this.num >= 3) return '目前最多只能订阅三个人'
                // 检查必选参数是否有值
                if (!mid) return '请输入用户uid'
                // 判断要订阅的用户是否已经存在于订阅管理对象中
                if (this.subManager && this.subManager.some(sub => sub.uid === mid)) {
                    return '已订阅该用户，请勿重复订阅'
                }
                // 定义是否需要直播通知，动态订阅，视频推送
                let liveMsg, dynamicMsg: boolean
                // 获取用户信息
                const content = await ctx.biliAPI.getUserInfo(mid)
                // 判断是否有其他问题
                if (content.code !== 0) {
                    let msg: string
                    switch (content.code) {
                        case -400: msg = '请求错误'; break;
                        case -403: msg = '访问权限不足，尝试重新登录，如果不行请联系管理员'; break;
                        case -404: msg = '用户不存在'; break;
                        case -352: msg = '请登录后再尝试订阅'; break;
                        default: msg = '未知错误，请联系管理员'
                    }
                    return msg
                }
                // 获取data
                const { data } = content
                // 判断是否需要订阅直播
                liveMsg = await this.checkIfNeedSub(options.live, '直播', session, data)
                // 判断是否需要订阅动态
                dynamicMsg = await this.checkIfNeedSub(options.dynamic, '动态', session)
                // 判断是哪个平台
                let platform: string
                if (!guildId) { // 没有输入群号，默认当前聊天环境
                    switch (session.event.platform) {
                        case 'qqguild': guildId = session.event.channel.id; break;
                        case 'qq': guildId = session.event.guild.id; break;
                        default: return '暂不支持该平台'
                    }
                }
                // 定义Bot
                let bot: Bot<Context>
                // 判断是哪个聊天平台
                switch (session.event.platform) {
                    case 'qqguild': {
                        bot = this.qqguildBot
                        platform = 'qqguild'
                        break
                    }
                    case 'qq': {
                        bot = this.qqBot
                        platform = 'qq'
                        break
                    }
                    default: return '暂不支持该平台'
                }
                // 保存到数据库中
                const sub = await ctx.database.create('bilibili', {
                    uid: mid,
                    room_id: data.live_room.roomid.toString(),
                    dynamic: dynamicMsg ? 1 : 0,
                    video: 1,
                    live: liveMsg ? 1 : 0,
                    targetId: guildId,
                    platform,
                    time: new Date()
                })
                // 订阅数+1
                this.num++
                // 开始订阅
                // 保存新订阅对象
                this.subManager.push({
                    id: sub.id,
                    uid: mid,
                    targetId: guildId,
                    roomId: data.live_room.roomid.toString(),
                    live: liveMsg,
                    dynamic: dynamicMsg,
                    liveDispose: null,
                    dynamicDispose: null
                })
                // 获取用户信息
                const { data: userData } = await ctx.biliAPI.getMasterInfo(sub.uid)
                // 需要订阅直播
                if (liveMsg) {
                    await session.execute(`bili live ${data.live_room.roomid} ${guildId} -b ${platform}`)
                    // 发送订阅消息通知
                    await bot.sendMessage(sub.targetId, `订阅${userData.info.uname}直播通知`)
                }
                // 需要订阅动态
                if (dynamicMsg) {
                    await session.execute(`bili dynamic ${mid} ${guildId} -b ${platform}`)
                    // 发送订阅消息通知
                    await bot.sendMessage(sub.targetId, `订阅${userData.info.uname}动态通知`)
                }
            })

        ctx.command('bili')
            .subcommand('.dynamic <uid:string>')
            .option('bot', '-b <type:string>')
            .usage('订阅用户动态推送')
            .example('bili dynamic 1')
            .action(async ({ session, options }, uid, guildId) => {
                this.logger.info('调用bili.dynamic指令')
                // 如果uid为空则返回
                if (!uid) return '用户uid不能为空'
                if (!options.bot) return '非法调用'
                // 保存到订阅管理对象
                const index = this.subManager.findIndex(sub => sub.uid === uid)
                // 不存在则直接返回
                if (index === -1) {
                    session.send('请勿直接调用该指令')
                    return
                }
                // 获取对应Bot
                let bot: Bot<Context>
                switch (options.bot) {
                    case 'qq': bot = this.qqBot; break
                    case 'qqguild': bot = this.qqguildBot; break
                    default: return '非法调用'
                }
                // 开始循环检测
                const dispose = ctx.setInterval(this.dynamicDetect(ctx, bot, guildId, uid), 60000)
                // 将销毁函数保存到订阅管理对象
                this.subManager[index].dynamicDispose = dispose
            })

        ctx.command('bili')
            .subcommand('.live <roomId:string> <guildId:string>')
            .option('bot', '-b <type:string>')
            .usage('订阅主播开播通知')
            .example('bili live 732')
            .action(async ({ session, options }, roomId, guildId) => {
                this.logger.info('调用bili.live指令')
                // 如果room_id为空则返回
                if (!roomId) return '订阅主播房间号不能为空'
                if (!guildId) return '目标群组或频道不能为空'
                if (!options.bot) return '非法调用'
                // 保存到订阅管理对象
                const index = this.subManager.findIndex(sub => sub.roomId === roomId)
                // 要订阅的对象不在订阅管理对象中，直接返回
                if (index === -1) return '请勿直接调用该指令'
                // 获取对应Bot
                let bot: Bot<Context>
                switch (options.bot) {
                    case 'qq': bot = this.qqBot; break
                    case 'qqguild': bot = this.qqguildBot; break
                    default: return '非法调用'
                }
                // 开始循环检测
                const dispose = ctx.setInterval(this.liveDetect(ctx, bot, guildId, roomId), 5000)
                // 保存销毁函数
                this.subManager[index].liveDispose = dispose
            })

        ctx.command('bili')
            .subcommand('.status <roomId:string>')
            .usage('查询主播当前直播状态')
            .example('bili status 732')
            .action(async ({ session }, roomId) => {
                this.logger.info('调用bili.status指令')
                if (!roomId) return session.send('请输入房间号!')
                const content: any = await ctx.biliAPI.getLiveRoomInfo(roomId)
                const { data } = content
                const { data: userData } = await ctx.biliAPI.getMasterInfo(data.uid)
                // B站出问题了
                if (content.code !== 0) {
                    if (content.msg === '未找到该房间') {
                        session.send('未找到该房间！')
                    } else {
                        session.send('未知错误，请呼叫管理员检查问题！')
                    }
                    return
                }

                let liveTime = (new Date(data.live_time).getTime()) / 1000

                const string = await ctx.gimg.generateLiveImg(
                    data,
                    userData,
                    data.live_status !== 1 ?
                        LiveType.NotLiveBroadcast :
                        liveTime < Date.now() ? LiveType.LiveBroadcast : LiveType.StartBroadcasting
                )
                session.send(string)
            })
    }

    dynamicDetect(
        ctx: Context,
        bot: Bot<Context>,
        groupId: string,
        uid: string,
    ) {
        let firstSubscription: boolean = true
        let timePoint: number;

        return async () => {
            // 第一次订阅判断
            if (firstSubscription) {
                // 设置第一次的时间点
                timePoint = Date.now()
                // 设置第一次为false
                firstSubscription = false
                return
            }
            // 获取用户空间动态数据
            const content = await ctx.biliAPI.getUserSpaceDynamic(uid)
            // 判断是否出现其他问题
            if (content.code !== 0) {
                switch (content.code) {
                    case -101: { // 账号未登录
                        return '账号未登录'
                    }
                    default: { // 未知错误
                        return '未知错误'
                    }
                }
            }
            // 获取数据内容
            const items = content.data.items
            // 发送请求 只查看前五条数据
            for (let num = 4; num >= 0; num--) {
                // 没有动态内容则直接跳过
                if (!items[num]) continue
                // 寻找发布时间比时间点时间更晚的动态
                if (items[num].modules.module_author.pub_ts > timePoint) {
                    // 如果这是遍历的最后一条，将时间点设置为这条动态的发布时间
                    /*  if (num === 1) timePoint = items[num].modules.module_author.pub_ts
                    if (num === 0) {
                        timePoint = items[num].modules.module_author.pub_ts
                     } */
                    switch (num) {
                        // 如果是置顶动态，则跳过
                        case 0: if (items[num].modules.module_tag) continue
                        case 1: timePoint = items[num].modules.module_author.pub_ts
                    }
                    // 推送该条动态
                    const [pic] = await ctx.gimg.generateDynamicImg(items[num])
                    await bot.sendMessage(groupId, pic)
                }
            }
        }
    }

    liveDetect(
        ctx: Context,
        bot: Bot<Context>,
        groupId: string,
        roomId: string
    ) {
        let firstSubscription: boolean = true;
        let timer: number = 0;
        let open: boolean = false;
        let liveTime: string;
        let uData: any;

        return async () => {
            // 发送请求检测直播状态
            const content: any = await ctx.biliAPI.getLiveRoomInfo(roomId)
            const { data } = content
            // B站出问题了
            if (content.code !== 0) {
                if (content.msg === '未找到该房间') {
                    await bot.sendMessage(groupId, '未找到该房间！')
                } else {
                    await bot.sendMessage(groupId, '未知错误，请呼叫管理员检查问题！')
                }
                // dispose
                return
            }

            if (firstSubscription) {
                firstSubscription = false
                // 获取主播信息
                const { data: userData } = await ctx.biliAPI.getMasterInfo(data.uid)
                // 主播信息不会变，请求一次即可
                uData = userData
                // 判断直播状态
                if (data.live_status === 1) { // 当前正在直播
                    // 推送直播信息
                    await bot.sendMessage(groupId, await ctx
                        .gimg
                        .generateLiveImg(
                            data,
                            uData,
                            LiveType.LiveBroadcast
                        ))
                    // 改变开播状态
                    open = true
                } // 未开播，直接返回
                return
            }

            // 检查直播状态
            switch (data.live_status) {
                case 0:
                case 2: { // 状态 0 和 2 说明未开播
                    if (open) { // 之前开播，现在下播了
                        // 更改直播状态
                        open = false
                        // 下播了将定时器清零
                        timer = 0
                        // 发送下播通知
                        bot.sendMessage(groupId, `${uData.info.uname}下播啦，本次直播了${ctx.gimg.getTimeDifference(liveTime)}`)
                    }
                    // 未进循环，还未开播，继续循环
                    break
                }
                case 1: {
                    if (!open) { // 之前未开播，现在开播了
                        // 更改直播状态
                        open = true
                        // 设置开播时间
                        liveTime = data.live_time
                        // 获取主播信息
                        const { data: userData } = await ctx.biliAPI.getMasterInfo(data.uid)
                        // 主播信息不会变，开播时刷新一次即可
                        uData = userData
                        // 发送直播通知
                        await bot.sendMessage(groupId, await ctx.gimg.generateLiveImg(
                            data,
                            uData,
                            LiveType.StartBroadcasting
                        ))
                    } else { // 还在直播
                        if (this.config.pushTime > 0) {
                            timer++
                            // 开始记录时间
                            if (timer >= (12 * 30 * this.config.pushTime)) { // 到时间推送直播消息
                                // 到时间重新计时
                                timer = 0
                                // 发送状态信息
                                bot.sendMessage(groupId, await ctx
                                    .gimg
                                    .generateLiveImg(
                                        data,
                                        uData,
                                        LiveType.LiveBroadcast
                                    ))
                            }
                        }
                        // 否则继续循环
                    }
                }
            }
        }
    }

    async checkIfNeedSub(comNeed: boolean, subType: string, session: Session, data?: any): Promise<boolean> {
        if (comNeed) {
            if (subType === '直播' && data.live_room.roomStatus === 0) {
                return false
            }
            return true
        }
        let input: string // 用户输入
        // 询问用户是否需要订阅直播
        while (1) {
            session.send(`是否需要订阅${subType}？需要输入 y 不需要输入 n `)
            input = await session.prompt()
            if (!input) {
                await session.send('输入超时！请重新订阅')
                continue
            }
            switch (input) {
                case 'y': { // 需要订阅直播
                    // 如果用户没有开通直播间则无法订阅
                    if (subType === '直播' && data.live_room.roomStatus === 0) {
                        await session.send('该用户没有开通直播间，无法订阅直播')
                        return false
                    }
                    // 开启直播订阅
                    return true
                }
                // 不需要
                case 'n': return false
                default: { // 输入了其他的内容
                    session.send('输入有误，请输入 y 或 n')
                }
            }
        }
    }

    async getSubFromDatabase(ctx: Context) {
        // 从数据库中获取数据
        const subData = await ctx.database.get('bilibili', { id: { $gt: 0 } })
        // 设定订阅数量
        this.num = subData.length
        // 如果订阅数量超过三个则被非法修改数据库
        // 向管理员发送重新订阅通知
        if (this.num > 3) return
        // 定义Bot
        let bot: Bot<Context>
        // 循环遍历
        subData.forEach(sub => {
            // 拿到对应bot
            switch (sub.platform) {
                case 'qq': bot = this.qqBot
                case 'qqguild': bot = this.qqguildBot
            }
            // 构建订阅对象
            let subManagerItem = {
                id: sub.id,
                uid: sub.uid,
                roomId: sub.room_id,
                targetId: sub.targetId,
                live: +sub.live === 1 ? true : false,
                dynamic: +sub.dynamic === 1 ? true : false,
                liveDispose: null,
                dynamicDispose: null
            }
            // 判断需要订阅的服务
            if (sub.dynamic) { // 需要订阅动态
                // 开始循环检测
                const dispose = ctx.setInterval(this.dynamicDetect(ctx, bot, sub.targetId, sub.uid), 60000)
                // 保存销毁函数
                subManagerItem.dynamicDispose = dispose
            }
            if (sub.live) { // 需要订阅动态
                // 开始循环检测
                const dispose = ctx.setInterval(this.liveDetect(ctx, bot, sub.targetId, sub.room_id), 5000)
                // 保存销毁函数
                subManagerItem.liveDispose = dispose
            }
            // 保存新订阅对象
            this.subManager.push(subManagerItem)
            // 发送订阅成功通知
            bot.sendMessage(sub.targetId, '重新加载测试发送')
        })
    }
}

namespace ComRegister {
    export interface Config {
        pushTime: number
    }

    export const Config: Schema<Config> = Schema.object({
        pushTime: Schema.number().required()
    })
}


export default ComRegister