class myPromise {
  static PENDING = "pending"
  static FULFILLED = "fulfilled"
  static REJECTED = "rejected"
  static resolve = function (value) {
    return new myPromise((resolve, reject) => {
      resolve(value)
    })
  }
  static reject = function (value) {
    return new myPromise((resolve, reject) => {
      reject(value)
    })
  }
  constructor(actuator) {
    if (actuator instanceof Function === false) throw new TypeError(` Promise resolver ${actuator} is not a function`)

    // 初始化状态,成功的值以及失败的原因
    this.state = myPromise.PENDING
    this.value = undefined
    this.reason = undefined

    // 定义待处理事件的数组
    this.onResolvedCallbacks = []
    this.onRejectedCallbacks = []

    // 定义两个改变状态的函数
    const resolve = (value) => {
      if (this.state === myPromise.PENDING) {

        this.state = myPromise.FULFILLED
        this.value = value
        // 改变状态，处理待处理的事件
        this.onResolvedCallbacks.forEach(fn => fn(this.value))
      }
    }
    const reject = (reason) => {
      this.state = myPromise.REJECTED
      this.reason = reason
      // 改变状态，处理待处理的事件
      this.onRejectedCallbacks.forEach(fn => fn(this.reason))
    }

    // 执行执行器函数，并异步处理抛出的错误
    try {
      actuator(resolve, reject)
    } catch (err) {
      reject(err)
    }
  }

  // 实现对then的返回值，以及then中回调返回值的比较
  static resolvePromise(newPromise, x, resolve, reject) {
    // 若then的返回值，以及then中回调返回值指向同一个对象
    if (x === newPromise) {
      // 防止循环调用
      reject(new TypeError(`Chaining cycle detected for promise`))
    }
    // 若返回值x是一个新的promise实例，那么then返回的promise则必须等待x的状态改变
    if (x instanceof myPromise) {
      x.then(res => {
        // 若x的then方法返回仍然是一个promise实例，则继续调用静态方法，直到返回基础值
        // 将上一个promise的成功的值，作为参数传入，实现链式调用
        myPromise.resolvePromise(newPromise, res, resolve, reject)
      }, rec => {
        reject(rec)
      })
    }
    // 若x为对象或者函数
    else if (x !== null && (x instanceof Function || x instanceof Object)) {
      // 若取then时抛出错误，则以e为据因拒绝Promise
      try {
        // 把x.then赋值为then,规范注解5 : 
        // 这步我们先是存储了一个指向 x.then 的引用，然后测试并调用该引用，以避免多次访问 x.then 属性。
        // 这种预防措施确保了该属性的一致性，因为其值可能在检索调用时被改变。
        const then = x.then
        let called = false
        // 若x.then是函数
        if (then instanceof Function) {
          // 若then是函数，则将x作为then的this调用，并传入两个参数
          // 并忽略第一次调用的其他次调用
          then.call(
            x,
            res => {
              if (called) return
              called = true
              // 若then方法返回的新myPromise的then方法任然返回myPromise实例，则继续调用
              // 直到处理程序中的返回值为普通值，也就是下面的else
              myPromise.resolvePromise(newPromise, res, resolve, reject)
            },
            rej => {
              // 若then方法
              if (called) return
              called = true
              reject(rej)
            }
          )
        } else {
          if (called) return
          called = true
          resolve(x)
        }
      } catch (error) {
        // 若then方法抛出异常，但上面的call中的两个函数已经执行过，那么则忽略
        if (called) return
        called = true
        // 否则则以抛出的异常，拒绝执行
        reject(error)
      }

    }
    // 若x为普通数值，则直接调用resolve
    else {
      resolve(x)
    }
  }
  // 实现thenable接口
  then(onResolved, onRejected) {
    // 参数校验,若传入的回调不是函数
    if (onResolved instanceof Function === false) {
      onResolved = (value) => {
        return value
      }
    }
    if (onRejected instanceof Function === false) {
      onRejected = (reason) => {
        // throw new Error(reason)
        return reason
      }
    }

    // 定义返回的新的promise
    const newPromise = new myPromise((resolve, reject) => {
      // 若状态已经改变，则将两个回调函数推入微任务队列
      if (this.state === myPromise.FULFILLED) {
        window.queueMicrotask(() => {
          // 拿到返回值,若前一个promise成功拿到返回值，则新的promise的状态为成功
          // 若没拿到返回值则以出现的异常作为新promise失败的原因
          try {
            const x = onResolved(this.value)
            // resolve(x)，用resolvePromise替换直接执行resolve方法，因为要判断then
            // 中回调函数返回值的类型
            myPromise.resolvePromise(newPromise, x, resolve, reject)
          } catch (error) {
            reject(error)
          }
        })
      }
      if (this.state === myPromise.REJECTED) {
        window.queueMicrotask(() => {
          // 拿到返回值
          try {
            const x = onRejected(this.reason)
            // resolve(x)，用resolvePromise替换直接执行resolve方法，因为要判断then
            // 中回调函数返回值的类型
            myPromise.resolvePromise(newPromise, x, resolve, reject)
          } catch (error) {
            reject(error)
          }
        })
      }

      // 若执行then方法时，状态还未改变，则将待处理的回调传入待处理数组
      // 等到状态改变时，处理
      if (this.state === myPromise.PENDING) {
        this.onResolvedCallbacks.push(res => {
          // 这里传res,还是this.res没有区别，因为在resolve中已经将this.res作为参数传入
          // 所以res形参等于this.res实参
          setTimeout(() => {
            try {
              const x = onResolved(res)
              myPromise.resolvePromise(newPromise, x, resolve, reject)
            } catch (error) {
              reject(error)
            }
          }, 0)

        })

        this.onRejectedCallbacks.push(reason => {
          setTimeout(() => {
            try {
              const x = onRejected(reason)
              // resolve(x)，用resolvePromise替换直接执行resolve方法，因为要判断then
              // 中回调函数返回值的类型
              myPromise.resolvePromise(newPromise, x, resolve, reject)
            } catch (error) {
              reject(error)
            }
          }, 0)
        })
      }
    })
    return newPromise
  }
}
