'use strict'

// 全局变量：存储所有收纳的标签页组
window.tabList = {}

// 文档加载完成后初始化
document.addEventListener('DOMContentLoaded', async function () {
    // 从存储加载收纳列表
    loadStorage().then(list => {
        tabList = list
        storageShowAll()  // 调试：显示存储内容
    }).catch((err, list) => {
        tabList = list || {}
        debug('loadStorage error:', err, 'list:', list)
    })

    // 监听工具栏图标点击事件
    B.browserAction.onClicked.addListener(onTakeAll)
})

// 创建右键菜单项
// 菜单项1：打开收纳盒主页
B.contextMenus.create({
    id: "openHome",
    title: "打开梦想标签收纳盒",
    contexts: ["all"]  // 在所有上下文中显示
})

B.contextMenus.create({
    type: "separator",  // 分隔线
    contexts: ["all"]
})

// 菜单项2：收纳全部标签
B.contextMenus.create({
    id: "takeAllTabs",
    title: "收纳全部标签",
    contexts: ["all"]
})

// 菜单项3：仅收纳当前标签
B.contextMenus.create({
    id: "takeCurrentTab",
    title: "仅收纳此标签",
    contexts: ["page", "frame"]  // 只在页面和框架上下文中显示
})

B.contextMenus.create({
    type: "separator",
    contexts: ["all"]
})

// 菜单项4：排除当前网站（复选框类型）
B.contextMenus.create({
    id: 'excludeHost',
    title: "排除这个网站",
    contexts: ["page", "frame"],
    type: 'checkbox'
})

// 监听右键菜单点击事件
B.contextMenus.onClicked.addListener(function(info, tab) {
    switch(info.menuItemId) {
        case "openHome":
            openHome();  // 打开收纳盒主页
            break;
        case "takeAllTabs":
            onTakeAll();  // 收纳全部标签
            break;
        case "takeCurrentTab":
            onTake(info, tab);  // 仅收纳当前标签
            break;
        case "excludeHost":
            onExcludeHost(info, tab);  // 排除当前网站
            break;
    }
});

// 存储排除的网站列表
let excludeHostArr = []

// 监听标签页切换事件，更新排除网站复选框状态
B.tabs.onActivated.addListener(function (info) {
    getTab(info.tabId).then(r => {
        let host = getHost(r.url)
        debug('host:', host)
        // 根据当前网站是否在排除列表中更新复选框状态
        B.contextMenus.update('excludeHost', {checked: excludeHostArr.includes(host)})
    }).catch(err => debug('getTab error:', err))
})

// 扩展启动时执行（延迟1毫秒）
setTimeout(() => {
    // 可以在这里添加启动时执行的代码
    // 例如：自动打开收纳盒主页或清理新标签页
    // openHome()
    // getAllTabs().then(tabs => tabs.forEach(tab => {
    //     tab.url.indexOf('chrome://newtab/') === 0 && B.tabs.remove(tab.id) // 启动时，如果有新建标签页，将其关闭
    // }))
}, 1)

/**
 * 收纳全部标签页
 * 1. 获取所有标签页
 * 2. 过滤排除的网站
 * 3. 添加到收纳列表
 * 4. 关闭原始标签页
 * 5. 打开收纳盒主页
 */
function onTakeAll() {
    getAllTabs().then(tabs => {
        let ids = []  // 要关闭的标签页ID数组
        let arr = []  // 用于去重的URL数组
        let list = [] // 要收纳的标签页数据

        tabs.forEach(tab => {
            if (isExclude(tab.url)) return // 排除链接

            ids.push(tab.id)  // 记录要关闭的标签页ID

            if (arr.includes(tab.url)) return // 排除重复链接
            arr.push(tab.url)

            list.push({title: tab.title, url: tab.url})
        })

        addTabList(tabList, list)  // 添加到收纳列表
        openHome()  // 打开收纳盒主页
        B.tabs.remove(ids)  // 关闭原始标签页，释放内存
    }).catch(err => {
        debug('getAllTabs error:', err)
    })
}

/**
 * 仅收纳当前标签页
 * @param {Object} info - 右键菜单信息
 * @param {Object} tab - 当前标签页信息
 */
function onTake(_, tab) {
    let keys = Object.keys(tabList)
    if (isExclude(tab.url)) return // 排除链接，不往下执行

    // 如果有收纳组，添加到最新的一组；否则创建新组
    if (keys.length > 0) {
        keys.sort()
        keys.reverse()
        let key = keys[0]  // 获取最新的收纳组键名
        tabList[key].tabs && tabList[key].tabs.unshift({title: tab.title, url: tab.url})
        saveStorage(tabList)
    } else {
        addTabList(tabList, [{title: tab.title, url: tab.url}])
    }
    // 可选：关闭原始标签页
    // B.tabs.remove(tab.id)
}

/**
 * 排除/取消排除当前网站
 * @param {Object} info - 右键菜单信息
 * @param {Object} tab - 当前标签页信息
 */
function onExcludeHost(_, tab) {
    let host = getHost(tab.url)
    let isInclude = excludeHostArr.includes(host)

    if (isInclude) {
        // 如果已存在，则移除
        let n = excludeHostArr.indexOf(host)
        if (n > -1) excludeHostArr.splice(n, 1)
    } else {
        // 如果不存在，则添加
        excludeHostArr.push(host)
    }

    // 更新右键菜单复选框状态
    B.contextMenus.update('excludeHost', {checked: !isInclude})
}

/**
 * 检查URL是否应该被排除
 * @param {string} url - 要检查的URL
 * @returns {boolean} 是否应该排除
 */
function isExclude(url) {
    if (url.indexOf(B.homeUrl) === 0) return true // 排除扩展首页
    if (url.indexOf('chrome://newtab/') === 0) return true // 排除Chrome新标签页
    if (url.indexOf('edge://newtab/') === 0) return true // 排除Edge新标签页
    if (url.indexOf('about:') === 0) return true // 排除空白页
    return excludeHostArr.includes(getHost(url)) // 检查是否在排除网站列表中
}
