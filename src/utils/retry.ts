/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
interface RetryOptions {
    attempts: number;
    onFailure?: (error: Error, attempts: number) => Promise<void> | void;
}

function Retry(options: RetryOptions = { attempts: 3 }): MethodDecorator {
    return function (
        target: Object,
        propertyKey: string | symbol,
        descriptor: TypedPropertyDescriptor<any>
    ) {
        const originalMethod = descriptor.value;

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

            throw lastError!;
        };

        return descriptor;
    };
}

export default Retry