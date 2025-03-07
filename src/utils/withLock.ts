/**
 * 高阶函数：为函数添加锁机制
 * @param {Function} fn - 需要包装的原始函数
 * @returns {Function} 带锁功能的函数
 */
function withLock(fn) {
    // 判断是否是异步函数
    const isAsync = fn.constructor.name === 'AsyncFunction'
    // 定义锁标志
    let locked = false

    // 判断是否为异步函数
    if (isAsync) {
        // 变为Promise
        return function (...args) {
            // 已加锁则跳过执行
            if (locked) return
            // 获取锁
            locked = true

            // 将异步函数转为Promise链
            Promise.resolve(fn(...args))
                .catch(err => {
                    // 打印错误
                    console.error("Execution error:", err)
                    // 重新抛出错误
                    throw err
                })
                .finally(() => {
                    // 确保释放锁
                    locked = false
                });
        };
    }

    // 不是异步函数
    return function (...args) {
        // 已加锁则跳过执行
        if (locked) return
        // 获取锁
        locked = true

        try {
            // 执行函数
            fn(...args)
        } catch (err) {
            // 打印错误
            console.error("Execution error:", err)
            // 重新抛出错误
            throw err
        } finally {
            // 无论成功失败都释放锁
            locked = false
        }
    }
}

export default withLock