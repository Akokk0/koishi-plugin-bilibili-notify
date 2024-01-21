import { Bot, Context, Logger, Schema, Session, h } from "koishi"
import { } from '@koishijs/plugin-help'
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
        // 从数据库获取订阅
        this.getSubFromDatabase(ctx)

        ctx.command('test', { hidden: true, /* permissions: ['authority:5'] */ })
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
                return content
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
            .action(async ({ session }, uid, index) => {
                // 获取用户空间动态数据
                const { data } = await ctx.biliAPI.getUserSpaceDynamic(uid)
                // 获取动态推送图片
                const { pic, buffer } = await ctx.gimg.generateDynamicImg(data.items[index])
                // 如果pic存在，则直接返回pic
                if (pic) return pic
                // pic不存在，说明使用的是page模式
                await session.send(h.image(buffer, 'image/png'))
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

        ctx.command('test')
            .subcommand('.utc')
            .usage('获取当前UTC+8 Unix时间戳')
            .example('test utc')
            .action(async ({ session }) => {
                session.send((await ctx.biliAPI.getServerUTCTime()).toString())
            })

        ctx.command('bili', 'bili-notify插件相关指令', { permissions: ['authority:3'] })
            .subcommand('.login', '登录B站之后才可以进行之后的操作')
            .usage('使用二维码登录，登录B站之后才可以进行之后的操作')
            .example('bili login')
            .action(async ({ session }) => {
                this.logger.info('调用bili login指令')
                // 获取二维码
                let content: any
                try {
                    content = await ctx.biliAPI.getLoginQRCode()
                } catch (e) {
                    return 'bili login getLoginQRCode() 本次网络请求失败'
                }
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
                    let loginContent: any
                    try {
                        loginContent = await ctx.biliAPI.getLoginStatus(content.data.qrcode_key)
                    } catch (e) {
                        this.logger.error(e)
                        return
                    }
                    if (loginContent.code !== 0) {
                        dispose()
                        return await session.send('登录失败！请联系管理员解决！')
                    }
                    if (loginContent.data.code === 86038) {
                        dispose()
                        return await session.send('二维码已失效，请重新登录！')
                    }
                    if (loginContent.data.code === 0) { // 登录成功
                        const encryptedCookies = ctx.wbi.encrypt(ctx.biliAPI.getCookies())
                        const encryptedRefreshToken = ctx.wbi.encrypt(loginContent.data.refresh_token)
                        await ctx.database.upsert('loginBili', [{
                            id: 1,
                            bili_cookies: encryptedCookies,
                            bili_refresh_token: encryptedRefreshToken
                        }])
                        // 销毁定时器
                        dispose()
                        // 清除控制台通知
                        ctx.biliAPI.disposeNotifier()
                        // 发送成功登录推送
                        await session.send('登录成功！')
                        // 订阅之前的订阅
                        await this.getSubFromDatabase(ctx)
                        // 调用bili show指令
                        await session.execute('bili show')
                        return
                    }
                }, 1000)
            })

        ctx.command('bili')
            .subcommand('.unsub <uid:string>', '取消订阅UP主动态、直播或全部')
            .usage('取消订阅，加-l为取消直播订阅，加-d为取消动态订阅，什么都不加则为全部取消')
            .option('live', '-l')
            .option('dynamic', '-d')
            .example('bili unsub 用户UID -ld')
            .action(async ({ session, options }, uid) => {
                this.logger.info('调用bili.unsub指令')
                // 若用户UID为空则直接返回
                if (!uid) return '用户UID不能为空'
                // 定义是否存在
                let exist: boolean
                await Promise.all(this.subManager.map(async (sub, i) => {
                    if (sub.uid === uid) {
                        // 取消单个订阅
                        if (options.live || options.dynamic) {
                            if (options.live) await session.send(this.unsubSingle(ctx, sub.roomId, 0)) /* 0为取消订阅Live */
                            if (options.dynamic) await session.send(this.unsubSingle(ctx, sub.uid, 1)) /* 1为取消订阅Dynamic */
                            // 将存在flag设置为true
                            exist = true
                            return
                        }
                        // 取消全部订阅 执行dispose方法，销毁定时器
                        if (sub.dynamic) this.subManager[i].dynamicDispose()
                        if (sub.live) this.subManager[i].liveDispose()
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
            .subcommand('.show', '展示订阅对象')
            .usage('展示订阅对象')
            .example('bili show')
            .action(async ({ session }) => {
                let table: string = ``
                this.subManager.forEach(sub => {
                    table += `UID:${sub.uid}  ${sub.dynamic ? '已订阅动态' : ''}  ${sub.live ? '已订阅直播' : ''}` + '\n'
                })
                !table && session.send('没有订阅任何UP')
                table && session.send(table)
            })

        ctx.command('bili')
            .subcommand('.sub <mid:string> [guildId:string]', '订阅用户动态和直播通知')
            .option('live', '-l')
            .option('dynamic', '-d')
            .usage('订阅用户动态和直播通知，若需要订阅直播请加上-l，需要订阅动态则加上-d。若没有加任何参数，之后会向你单独询问，尖括号中为必选参数，中括号为可选参数，目标群号若不填，则默认为当前群聊')
            .example('bili sub 1194210119 目标QQ群号(暂不支持) -l -d 订阅UID为1194210119的UP主的动态和直播')
            .action(async ({ session, options }, mid, guildId) => {
                this.logger.info('调用bili.sub指令')
                // 检查是否登录
                if (!(await this.checkIfIsLogin(ctx))) {
                    // 未登录直接返回
                    return '请使用指令bili login登录后再进行订阅操作'
                }
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
                let content: any
                try {
                    content = await ctx.biliAPI.getUserInfo(mid)
                } catch (e) {
                    return 'bili sub getUserInfo() 本次网络请求失败'
                }
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
                // 判断是否未订阅任何消息
                if (!liveMsg && !dynamicMsg) {
                    return '您未订阅该UP的任何消息'
                }
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
                    room_id: data.live_room?.roomid.toString(),
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
                    roomId: data.live_room?.roomid.toString(),
                    live: liveMsg,
                    dynamic: dynamicMsg,
                    liveDispose: null,
                    dynamicDispose: null
                })
                // 获取用户信息
                let userData: any
                try {
                    const { data } = await ctx.biliAPI.getMasterInfo(sub.uid)
                    userData = data
                } catch (e) {
                    return 'bili sub指令 getMasterInfo() 网络请求失败'
                }
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
            .subcommand('.dynamic <uid:string> <guildId:string>', '订阅用户动态推送', { hidden: true })
            .option('bot', '-b <type:string>')
            .usage('订阅用户动态推送')
            .example('bili dynamic 1194210119 订阅UID为1194210119的动态')
            .action(async ({ session, options }, uid, guildId) => {
                this.logger.info('调用bili.dynamic指令')
                // 如果uid为空则返回
                if (!uid) return '用户uid不能为空'
                if (!guildId) return '目标群组或频道不能为空'
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
                const dispose = ctx.setInterval(this.dynamicDetect(ctx, bot, guildId, uid), config.dynamicLoopTime * 1000)
                // 将销毁函数保存到订阅管理对象
                this.subManager[index].dynamicDispose = dispose
            })

        ctx.command('bili')
            .subcommand('.live <roomId:string> <guildId:string>', '订阅主播开播通知', { hidden: true })
            .option('bot', '-b <type:string>')
            .usage('订阅主播开播通知')
            .example('bili live 26316137 订阅房间号为26316137的直播间')
            .action(async ({ options }, roomId, guildId) => {
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
                const dispose = ctx.setInterval(this.liveDetect(ctx, bot, guildId, roomId), config.liveLoopTime * 1000)
                // 保存销毁函数
                this.subManager[index].liveDispose = dispose
            })

        ctx.command('bili')
            .subcommand('.status <roomId:string>', '查询主播当前直播状态', { hidden: true })
            .usage('查询主播当前直播状态')
            .example('bili status 732')
            .action(async ({ session }, roomId) => {
                this.logger.info('调用bili.status指令')
                if (!roomId) return session.send('请输入房间号!')
                let content: any
                try {
                    content = await ctx.biliAPI.getLiveRoomInfo(roomId)
                } catch (e) {
                    return 'bili status指令 getLiveRoomInfo() 本次网络请求失败'
                }
                const { data } = content
                let userData: any
                try {
                    const { data: userInfo } = await ctx.biliAPI.getMasterInfo(data.uid)
                    userData = userInfo
                } catch (e) {
                    return 'bili status指令 getMasterInfo() 网络请求失败'
                }
                // B站出问题了
                if (content.code !== 0) {
                    if (content.msg === '未找到该房间') {
                        session.send('未找到该房间！')
                    } else {
                        session.send('未知错误，请呼叫管理员检查问题！')
                    }
                    return
                }

                const { pic, buffer } = await ctx.gimg.generateLiveImg(
                    data,
                    userData,
                    data.live_status !== 1 ?
                        LiveType.NotLiveBroadcast :
                        LiveType.LiveBroadcast
                )
                // pic 存在，使用的是render模式
                if (pic) return pic
                // pic不存在，说明使用的是page模式
                await session.send(h.image(buffer, 'image/png'))
            })
    }

    dynamicDetect(
        ctx: Context,
        bot: Bot<Context>,
        guildId: string,
        uid: string,
    ) {
        let firstSubscription: boolean = true
        let timePoint: number
        // Test code
        let timer = 0

        return async () => {
            // Test code
            console.log('timer:' + timer++);
            console.log('firstSubscription:' + firstSubscription);
            console.log(`timePoint: ${timePoint}`);
            console.log(`timePoint: ${ctx.gimg.unixTimestampToString(timePoint)}`);

            // 第一次订阅判断
            if (firstSubscription) {
                // 设置第一次的时间点
                timePoint = await ctx.biliAPI.getServerUTCTime()
                // 设置第一次为false
                firstSubscription = false
                return
            }
            // 获取用户空间动态数据
            let content: any
            try {
                content = await ctx.biliAPI.getUserSpaceDynamic(uid)
            } catch (e) {
                return this.logger.error('dynamicDetect getUserSpaceDynamic() 网络请求失败')
            }
            // 判断是否出现其他问题
            if (content.code !== 0) {
                switch (content.code) {
                    case -101: { // 账号未登录
                        bot.sendMessage(guildId, '账号未登录，请登录后重新订阅动态')
                    }
                    default: { // 未知错误
                        bot.sendMessage(guildId, '未知错误，请重新订阅动态')
                    }
                }
                // 取消订阅
                this.unsubSingle(ctx, uid, 1) /* 1为取消动态订阅 */
                return
            }
            // 获取数据内容
            const items = content.data.items
            // 发送请求 默认只查看配置文件规定的数据
            for (let num = this.config.dynamicCheckNumber - 1; num >= 0; num--) {
                // 没有动态内容则直接跳过
                if (!items[num]) continue

                // Test code
                console.log(`items[${num}].modules.module_author.pub_ts: ${items[num].modules.module_author.pub_ts}`);
                console.log(`items[${num}].modules.module_author.pub_ts: ${ctx.gimg.unixTimestampToString(items[num].modules.module_author.pub_ts)}`);

                // 寻找发布时间比时间点时间更晚的动态
                if (items[num].modules.module_author.pub_ts > timePoint) {
                    // 如果这是遍历的最后一条，将时间点设置为这条动态的发布时间
                    /*  if (num === 1) timePoint = items[num].modules.module_author.pub_ts
                    if (num === 0) {
                        timePoint = items[num].modules.module_author.pub_ts
                     } */
                    // 检查最一条动态是否是置顶动态
                    if (num === 0) {
                        // 如果是置顶动态，则跳过
                        if (items[num].modules.module_tag) {
                            // 将上一条动态的发布时间设为时间点
                            timePoint = items[num + 1].modules.module_author.pub_ts
                            continue
                        }
                        timePoint = items[num].modules.module_author.pub_ts
                    }
                    // 推送该条动态
                    let attempts = 3;
                    for (let i = 0; i < attempts; i++) {
                        try {
                            // 获取动态推送图片
                            const { pic, buffer } = await ctx.gimg.generateDynamicImg(items[num])
                            // 如果pic存在，则直接返回pic
                            if (pic) return await bot.sendMessage(guildId, pic)
                            // pic不存在，说明使用的是page模式
                            await bot.sendMessage(guildId, h.image(buffer, 'image/png'))
                            // 如果成功，那么跳出循环
                            break
                        } catch (e) {
                            if (i === attempts - 1) {  // 如果已经尝试了三次，那么抛出错误
                                throw e;
                            }
                        }
                    }
                }
            }
        }
    }

    liveDetect(
        ctx: Context,
        bot: Bot<Context>,
        guildId: string,
        roomId: string
    ) {
        let firstSubscription: boolean = true;
        let timer: number = 0;
        let open: boolean = false;
        let liveTime: string;
        let uData: any;
        // 相当于锁的作用，防止上一个循环没处理完
        let flag: boolean = true

        async function sendLiveNotifyCard(data: any, uData: any, liveType: LiveType) {
            // 获取直播通知卡片
            const { pic, buffer } = await ctx.gimg.generateLiveImg(data, uData, liveType)
            // 推送直播信息
            // pic 存在，使用的是render模式
            if (pic) return bot.sendMessage(guildId, pic)
            // pic不存在，说明使用的是page模式
            await bot.sendMessage(guildId, h.image(buffer, 'image/png'))
        }

        return async () => {
            try {
                // console.log('start before' + ' ' + flag);
                // 如果flag为false则说明前面的代码还未执行完，则直接返回
                if (!flag) return
                flag && (flag = false)
                // console.log('start after' + ' ' + flag);
                // 发送请求检测直播状态
                let content: any
                try {
                    content = await ctx.biliAPI.getLiveRoomInfo(roomId)
                } catch (e) {
                    return this.logger.error('liveDetect getLiveRoomInfo 网络请求失败')
                }

                const { data } = content
                // B站出问题了
                if (content.code !== 0) {
                    if (content.msg === '未找到该房间') {
                        await bot.sendMessage(guildId, '未找到该房间，请检查房间号后重新订阅')
                    } else {
                        await bot.sendMessage(guildId, '未知错误，请呼叫管理员检查问题后重新订阅')
                    }
                    // dispose
                    this.unsubSingle(ctx, roomId, 0) /* 0为取消Live订阅 */
                    return
                }
                if (firstSubscription) {
                    firstSubscription = false
                    // 获取主播信息
                    let userData: any
                    try {
                        const { data: userInfo } = await ctx.biliAPI.getMasterInfo(data.uid)
                        userData = userInfo
                    } catch (e) {
                        return this.logger.error('liveDetect first sub getMasterInfo() 网络请求错误')
                    }
                    // 主播信息不会变，请求一次即可
                    uData = userData
                    // 判断直播状态
                    if (data.live_status === 1) { // 当前正在直播
                        // 设置开播时间
                        liveTime = data.live_time
                        // 发送直播通知卡片
                        sendLiveNotifyCard(data, uData, LiveType.LiveBroadcast)
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
                            bot.sendMessage(guildId, `${uData.info.uname}下播啦，本次直播了${await ctx.gimg.getTimeDifference(liveTime)}`)
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
                            let userData: any
                            try {
                                const { data: userInfo } = await ctx.biliAPI.getMasterInfo(data.uid)
                                userData = userInfo
                            } catch (e) {
                                return this.logger.error('liveDetect open getMasterInfo() 网络请求错误')
                            }
                            // 主播信息不会变，开播时刷新一次即可
                            uData = userData
                            // 发送直播通知卡片
                            sendLiveNotifyCard(data, uData, LiveType.StartBroadcasting)
                        } else { // 还在直播
                            if (this.config.pushTime > 0) {
                                timer++
                                // 开始记录时间
                                if (timer >= (6 * 60 * this.config.pushTime)) { // 到时间推送直播消息
                                    // 到时间重新计时
                                    timer = 0
                                    // 发送直播通知卡片
                                    sendLiveNotifyCard(data, uData, LiveType.LiveBroadcast)
                                }
                            }
                            // 否则继续循环
                        }
                    }
                }
            } finally {
                // console.log('end before' + ' ' + flag);
                // 执行完方法体不论如何都把flag设置为true
                flag = true
                // console.log('end after' + ' ' + flag);
            }
        }
    }

    async checkIfNeedSub(comNeed: boolean, subType: string, session: Session, data?: any): Promise<boolean> {
        if (comNeed) {
            if (subType === '直播' && !data.live_room) {
                await session.send('该用户未开通直播间，无法订阅直播')
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
                    if (subType === '直播' && !data.live_room) {
                        await session.send('该用户未开通直播间，无法订阅直播')
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
        if (!(await this.checkIfIsLogin(ctx))) { // 如果未登录，则直接返回
            return
        }
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
                const dispose = ctx.setInterval(this.dynamicDetect(ctx, bot, sub.targetId, sub.uid), this.config.dynamicLoopTime * 1000)
                // 保存销毁函数
                subManagerItem.dynamicDispose = dispose
            }
            if (sub.live) { // 需要订阅动态
                // 开始循环检测
                const dispose = ctx.setInterval(this.liveDetect(ctx, bot, sub.targetId, sub.room_id), this.config.liveLoopTime * 1000)
                // 保存销毁函数
                subManagerItem.liveDispose = dispose
            }
            // 保存新订阅对象
            this.subManager.push(subManagerItem)
            // 发送订阅成功通知
        })
    }

    unsubSingle(ctx: Context, id: string /* UID或RoomId */, type: number /* 0取消Live订阅，1取消Dynamic订阅 */): string {
        let index: number
        switch (type) {
            case 0: { // 取消Live订阅
                index = this.subManager.findIndex(sub => sub.roomId === id)
                if (index === -1) return '未订阅该用户，无需取消订阅'
                // 取消订阅
                this.subManager[index].live && this.subManager[index].liveDispose()
                // 如果没有对这个UP的任何订阅，则移除
                if (!this.subManager[index].dynamic) {
                    // 获取要删除行的id
                    const id = this.subManager[index].id
                    // 从管理对象中移除
                    this.subManager = this.subManager.splice(index, index)
                    // 从数据库中删除
                    ctx.database.remove('bilibili', [id])
                    // num--
                    this.num--
                    return '已取消订阅该用户'
                }
                this.subManager[index].liveDispose = null
                this.subManager[index].live = false
                // 更新数据库
                ctx.database.upsert('bilibili', [{
                    id: +`${this.subManager[index].id}`,
                    live: 0
                }])
                return '已取消订阅Live'
            }
            case 1: { // 取消Dynamic订阅
                index = this.subManager.findIndex(sub => sub.uid === id)
                if (index === -1) return '未订阅该用户，无需取消订阅'
                // 取消订阅
                this.subManager[index].dynamic && this.subManager[index].dynamicDispose()
                // 如果没有对这个UP的任何订阅，则移除
                if (!this.subManager[index].live) {
                    // 获取要删除行的id
                    const id = this.subManager[index].id
                    // 从管理对象中移除
                    this.subManager = this.subManager.splice(index, index)
                    // 从数据库中删除
                    ctx.database.remove('bilibili', [id])
                    // num--
                    this.num--
                    return '已取消订阅该用户'
                }
                this.subManager[index].dynamicDispose = null
                this.subManager[index].dynamic = false
                // 更新数据库
                ctx.database.upsert('bilibili', [{
                    id: +`${this.subManager[index].id}`,
                    dynamic: 0
                }])
                return '已取消订阅Dynamic'
            }
        }
    }

    async checkIfIsLogin(ctx: Context) {
        if ((await ctx.database.get('loginBili', 1)).length !== 0) { // 数据库中有数据
            // 检查cookie中是否有值
            if (ctx.biliAPI.getCookies() !== '[]') { // 有值说明已登录
                return true
            }
        }
        return false
    }
}

namespace ComRegister {
    export interface Config {
        pushTime: number,
        liveLoopTime: number,
        dynamicLoopTime: number,
        dynamicCheckNumber: number
    }

    export const Config: Schema<Config> = Schema.object({
        pushTime: Schema.number().required(),
        liveLoopTime: Schema.number().default(10),
        dynamicLoopTime: Schema.number().default(60),
        dynamicCheckNumber: Schema.number().required()
    })
}

export default ComRegister