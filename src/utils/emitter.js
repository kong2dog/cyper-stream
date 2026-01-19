/**
 * CyperStream Emitter
 * 事件发射器类，实现发布-订阅模式
 * 用于模块间的解耦通信
 */
export default class Emitter {
  /**
   * 构造函数
   * 初始化事件存储对象
   */
  constructor() {
    // 使用 Object.create(null) 创建纯净对象，避免原型链污染
    this.events = Object.create(null);
  }

  /**
   * 注册事件监听器
   * @param {string} name - 事件名称
   * @param {Function} fn - 回调函数
   * @param {Object} [ctx] - 回调函数的上下文（this指向）
   * @returns {Emitter} 返回当前实例，支持链式调用
   */
  on(name, fn, ctx) {
    if (typeof fn !== "function") {
      console.error("Emitter Error: fn must be a function");
      return this;
    }

    const events = this.events[name] || (this.events[name] = []);
    events.push({ fn, ctx });
    return this;
  }

  /**
   * 注册一次性事件监听器
   * 触发一次后自动移除
   * @param {string} name - 事件名称
   * @param {Function} fn - 回调函数
   * @param {Object} [ctx] - 回调函数的上下文
   * @returns {Emitter} 返回当前实例
   */
  once(name, fn, ctx) {
    if (typeof fn !== "function") {
      console.error("Emitter Error: fn must be a function");
      return this;
    }

    const listener = (...args) => {
      this.off(name, listener);
      Promise.resolve().then(() => {
        fn.apply(ctx, args);
      }); // 防止阻塞进程
    };

    // 保存原始函数的引用，以便可以通过原始函数名移除监听
    listener._ = fn;
    return this.on(name, listener, ctx);
  }

  /**
   * 触发事件
   * @param {string} name - 事件名称
   * @param {...any} args - 传递给回调函数的参数
   * @returns {Emitter} 返回当前实例
   */
  emit(name, ...args) {
    const events = this.events[name];

    if (!events || events.length === 0) {
      return this;
    }

    // 复制数组以防止在回调执行期间事件队列被修改（如在回调中调用 off）
    const copy = events.slice();

    for (let i = 0; i < copy.length; i++) {
      const { fn, ctx } = copy[i];
      Promise.resolve().then(() => {
        fn.apply(ctx, args);
      }); // 防止阻塞进程
    }

    return this;
  }

  /**
   * 移除事件监听器
   * @param {string} [name] - 事件名称。如果不传，移除所有事件。
   * @param {Function} [callback] - 指定要移除的回调函数。如果不传，移除该事件下的所有回调。
   * @returns {Emitter} 返回当前实例
   */
  off(name, callback) {
    // 1. 如果没有参数，清空所有事件
    if (!name) {
      this.events = Object.create(null);
      return this;
    }

    const events = this.events[name];
    if (!events) {
      return this;
    }

    // 2. 如果没有指定回调，移除该事件名称下的所有监听
    if (!callback) {
      delete this.events[name];
      return this;
    }

    // 3. 移除指定的回调函数
    const liveEvents = events.filter(
      (item) => item.fn !== callback && item.fn._ !== callback,
    );

    if (liveEvents.length) {
      this.events[name] = liveEvents;
    } else {
      delete this.events[name];
    }

    return this;
  }
}
