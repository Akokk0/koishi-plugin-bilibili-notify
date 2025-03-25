/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
interface RetryOptions {
	attempts: number;
	onFailure?: (error: Error, attempts: number) => Promise<void> | void;
}

export function Retry(
	options: RetryOptions = { attempts: 3 },
): MethodDecorator {
	return (
		// biome-ignore lint/complexity/noBannedTypes: <explanation>
		target: Object,
		propertyKey: string | symbol,
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		descriptor: TypedPropertyDescriptor<any>,
	) => {
		const originalMethod = descriptor.value;

		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		descriptor.value = async function (...args: any[]) {
			let lastError: Error;

			for (let i = 0; i < options.attempts; i++) {
				try {
					return await originalMethod.apply(this, args);
				} catch (error) {
					lastError = error as Error;
					if (options.onFailure) {
						await options.onFailure.call(this, lastError, i + 1);
					}
				}
			}

			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			throw lastError!;
		};

		return descriptor;
	};
}

/**
 * 高阶函数：为函数添加锁机制
 * @param {Function} fn - 需要包装的原始函数
 * @returns {Function} 带锁功能的函数
 */
export function withLock(fn) {
	// 判断是否是异步函数
	const isAsync = fn.constructor.name === "AsyncFunction";
	// 定义锁标志
	let locked = false;

	// 判断是否为异步函数
	if (isAsync) {
		// 变为Promise
		return (...args) => {
			// 已加锁则跳过执行
			if (locked) return;
			// 获取锁
			locked = true;

			// 将异步函数转为Promise链
			Promise.resolve(fn(...args))
				.catch((err) => {
					// 打印错误
					console.error("Execution error:", err);
					// 重新抛出错误
					throw err;
				})
				.finally(() => {
					// 确保释放锁
					locked = false;
				});
		};
	}

	// 不是异步函数
	return (...args) => {
		// 已加锁则跳过执行
		if (locked) return;
		// 获取锁
		locked = true;

		try {
			// 执行函数
			fn(...args);
		} catch (err) {
			// 打印错误
			console.error("Execution error:", err);
			// 重新抛出错误
			throw err;
		} finally {
			// 无论成功失败都释放锁
			locked = false;
		}
	};
}

export async function withRetry(fn, maxAttempts = 3, delayMs = 1000) {
	let attempt = 0;
	while (attempt < maxAttempts) {
		try {
			return await fn();
		} catch (error) {
			attempt++;
			if (attempt >= maxAttempts) throw error;
			await new Promise((resolve) => setTimeout(resolve, delayMs * attempt)); // 指数退避
		}
	}
}
