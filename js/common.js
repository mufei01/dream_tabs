'use strict'

// 全局变量声明
window.isDebug = false  // 调试模式开关
window.isFirefox = navigator.userAgent.includes("Firefox")  // 检测是否为Firefox浏览器

// 浏览器API封装对象
window.B = {
    getBackgroundPage: chrome.extension.getBackgroundPage,  // 获取后台页面引用
    id: chrome.runtime.id,  // 扩展ID
    root: chrome.runtime.getURL(''),  // 扩展根目录URL
    homeUrl: chrome.runtime.getURL('dream_tabs.html'),  // 扩展主页URL
    error: chrome.runtime.lastError,  // 最后错误信息
    browserAction: chrome.browserAction,  // 浏览器工具栏按钮API
    storage: chrome.storage,  // 存储API
    contextMenus: chrome.contextMenus,  // 右键菜单API
    tabs: chrome.tabs,  // 标签页API
}

/**
 * 字符串格式化函数
 * 使用方法："Hello {0}, this is {1}".format("World", "JavaScript")
 */
String.prototype.format = function () {
    let args = arguments
    return this.replace(/{(\d+)}/g, function (match, number) {
        return typeof args[number] != 'undefined' ? args[number] : match
    })
}

/**
 * 添加标签页组到收纳列表
 * @param {Object} tabList - 收纳列表对象
 * @param {Array} tabs - 标签页数组
 * @returns {Object} 更新后的收纳列表
 */
function addTabList(tabList, tabs) {
    if (tabs.length > 0) {
        let t = Date.now()  // 使用当前时间戳作为唯一标识
        tabList[t] = {
            title: getTitle(),  // 生成默认标题
            locked: false,      // 是否锁定（锁定后不可删除）
            topped: false,      // 是否置顶
            toppedDate: 0,      // 置顶时间戳
            tabs,               // 标签页数据
            createDate: t,      // 创建时间戳
        }
        saveStorage(tabList)  // 保存到存储
    }
    return tabList
}

/**
 * 对收纳列表进行排序
 * 排序规则：1.置顶时间倒序 2.创建时间倒序
 * @param {Object} tabList - 收纳列表对象
 * @returns {Array} 排序后的数组
 */
function sortTabList(tabList) {
    let arr = []
    Object.keys(tabList).forEach(v => arr.push(tabList[v]))  // 对象转数组
    arr = arr.sort((a, b) => b.createDate - a.createDate)  // 创建时间倒序
    arr = arr.sort((a, b) => b.toppedDate - a.toppedDate)  // 置顶时间倒序
    return arr
}

/**
 * 生成收纳组标题
 * @param {number} value - 时间戳（可选）
 * @returns {string} 格式化后的标题
 */
function getTitle(value) {
    return `收纳于 ${getDate(value)} ${getWeek(value)}`
}

/**
 * 格式化日期时间
 * @param {number} value - 时间戳（可选）
 * @returns {string} 格式化的日期时间字符串
 */
function getDate(value) {
    let d = value ? new Date(value) : new Date()
    d.setMinutes(-d.getTimezoneOffset() + d.getMinutes(), d.getSeconds(), 0)  // 时区调整
    let s = d.toJSON()
    s = s.replace('T', ' ')
    s = s.replace('.000Z', '')
    return s
}

/**
 * 获取星期几
 * @param {number} value - 时间戳（可选）
 * @returns {string} 星期几的中文表示
 */
function getWeek(value) {
    let d = value ? new Date(value) : new Date()
    let weekArr = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    return weekArr[d.getDay()]
}

/**
 * 保存收纳列表到存储
 * @param {Object} tabList - 收纳列表对象
 */
function saveStorage(tabList) {
    localStorage.setItem('tabList', JSON.stringify(tabList))  // 保存到localStorage
    storageLocalSet({tabList}).catch(err => debug(`save local error: ${err}`))  // 保存到chrome.storage.local

    // 注释：chrome.storage.sync有大小限制（单项8K，总量100K），不适合存储大量数据
    // !isDebug && storageSyncSet({tabList}).catch(err => debug(`save sync error: ${err}`))
}

/**
 * 从存储加载收纳列表
 * @returns {Promise<Object>} 收纳列表对象
 */
function loadStorage() {
    return new Promise((resolve, reject) => {
        (async () => {
            let s = localStorage.getItem('tabList')
            let list = {}
            try {
                list = JSON.parse(s) || {}
            } catch (err) {
                debug('[localStorage error]', err)
            }
            await storageLocalGet(['tabList']).then(r => {
                list = Object.assign(list, r.tabList)  // 合并localStorage和chrome.storage.local的数据
                resolve(list)
            }).catch(err => {
                reject(err)
            })
        })()
    })
}

/**
 * 打开扩展主页
 */
function openHome() {
    open(B.homeUrl)
}

/**
 * 在新标签页中打开URL
 * @param {string} url - 要打开的URL
 */
function open(url) {
    B.tabs.create({url})
}

/**
 * 获取所有标签页
 * @returns {Promise<Array>} 标签页数组
 */
function getAllTabs() {
    return new Promise((resolve, reject) => {
        if (!isFirefox) {
            B.tabs.query({}, tabs => {
                B.error ? reject(B.error) : resolve(tabs)
            })
        } else {
            browser.tabs.query({}).then(tabs => resolve(tabs), err => reject(err))
        }
    })
}

/**
 * 获取指定标签页信息
 * @param {number} tabId - 标签页ID
 * @returns {Promise<Object>} 标签页信息
 */
function getTab(tabId) {
    return new Promise((resolve, reject) => {
        if (!isFirefox) {
            B.tabs.get(tabId, info => B.error ? reject(B.error) : resolve(info))
        } else {
            browser.tabs.get(tabId).then(info => resolve(info), err => reject(err))
        }
    })
}

/**
 * 从URL中提取主机名（域名）
 * @param {string} url - 完整的URL
 * @returns {string} 主机名（域名）
 */
function getHost(url) {
    if (!url) return ''
    let u = {}
    try {
        u = new URL(url)
    } catch (e) {
    }
    return u.host || ''
}

// 存储API的简化封装函数
function storageLocalGet(options) {
    return storage('local', 'get', options)
}

function storageLocalSet(options) {
    return storage('local', 'set', options)
}

function storageSyncGet(options) {
    return storage('sync', 'get', options)
}

function storageSyncSet(options) {
    return storage('sync', 'set', options)
}

/**
 * 调试函数：显示所有存储内容
 */
function storageShowAll() {
    if (!isDebug) return
    !isFirefox && storageSyncGet(null).then(function (r) {
        debug(`all sync storage:`, r)
    })
    storageLocalGet(null).then(function (r) {
        debug(`all local storage:`, r)
    })
}

/**
 * 通用存储操作函数
 * @param {string} type - 存储类型：'local' 或 'sync'
 * @param {string} method - 操作方法：'get' 或 'set'
 * @param {Object} options - 操作参数
 * @returns {Promise} 操作结果
 */
function storage(type, method, options) {
    return new Promise((resolve, reject) => {
        if (!isFirefox) {
            let callback = function (r) {
                let err = B.error
                err ? reject(err) : resolve(r)
            }
            let api = type === 'sync' ? B.storage.sync : B.storage.local
            if (method === 'get') {
                api.get(options, callback)
            } else if (method === 'set') {
                api.set(options, callback)
            }
        } else {
            let api = isDebug ? browser.storage.local : type === 'sync' ? browser.storage.sync : browser.storage.local
            if (method === 'get') {
                api.get(options).then(r => resolve(r), err => reject(err))
            } else if (method === 'set') {
                api.set(options).then(r => resolve(r), err => reject(err))
            }
        }
    })
}

/**
 * 调试输出函数
 * @param {...any} data - 要输出的数据
 */
function debug(...data) {
    isDebug && console.log('[DMX DEBUG]', ...data)
}

// DOM操作辅助函数
function addClass(el, className) {
    className = className.trim()
    let oldClassName = el.className.trim()
    if (!oldClassName) {
        el.className = className
    } else if (` ${oldClassName} `.indexOf(` ${className} `) === -1) {
        el.className += ' ' + className
    }
}

function rmClass(el, className) {
    if (!el.className) return
    className = className.trim()
    let newClassName = el.className.trim()
    if ((` ${newClassName} `).indexOf(` ${className} `) === -1) return
    newClassName = newClassName.replace(new RegExp('(?:^|\\s)' + className + '(?:\\s|$)', 'g'), ' ').trim()
    if (newClassName) {
        el.className = newClassName
    } else {
        el.removeAttribute('class')
    }
}

function hasClass(el, className) {
    if (!el.className) return false
    return (` ${el.className.trim()} `).indexOf(` ${className.trim()} `) > -1
}
