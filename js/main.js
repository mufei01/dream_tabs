// 获取后台页面的引用，用于访问全局变量和函数
let bg = chrome.extension.getBackgroundPage()
let tabList = bg.tabList  // 获取收纳列表数据
let mainEl = document.querySelector('.main')  // 主内容容器

// 文档加载完成后初始化
document.addEventListener('DOMContentLoaded', async function () {
    init()           // 初始化界面
    initDrag()       // 初始化拖放功能
    initExport()     // 初始化导出功能
    initImport()     // 初始化导入功能
})

/**
 * 初始化界面，渲染收纳列表
 */
function init() {
    let s = ''  // HTML字符串

    // 遍历排序后的收纳组，生成HTML
    sortTabList(tabList).forEach(items => {
        // 生成图标字符串（置顶和锁定图标）
        let iconStr = ''
        if (items.topped) iconStr += '<span class="icon icon-favorite"></span>'
        if (items.locked) iconStr += '<span class="icon icon-lock"></span>'

        // 收纳组卡片HTML
        s += `<div class="tab_cards" data-key="${items.createDate}">
<div class="card_title">
    ${iconStr}
    <span class="item_title">${items.title}</span>
    <span class="item_num">${items.tabs.length} 个标签</span>
    <span class="dmx_button" data-action="openAll"><i class="icon icon-open"></i>打开全部</span>
    <span class="extra">
        <span class="dmx_button" data-action="lock">${items.locked ? '<i class="icon icon-unlock"></i>解锁' : '<i class="icon icon-lock"></i>锁定'}</span>
        <span class="dmx_button" data-action="topping">${items.topped ? '<i class="icon icon-favorite-line"></i>撤顶' : '<i class="icon icon-favorite"></i>置顶'}</span>
        <span class="dmx_button" data-action="rename"><i class="icon icon-edit"></i>改名</span>
        ${items.locked ? '' : '<span class="dmx_button" data-action="deleteAll"><i class="icon icon-trash"></i>删除</span>'}
    </span>
</div>`

        // 标签页列表HTML
        s += `<div class="card_items" data-locked="${items.locked}">`
        items.tabs.forEach((v, k) => {
            // 如果未锁定，显示删除按钮
            let deleteBut = items.locked ? '' : '<span class="dmx_button item_remove" data-action="delete"><i class="icon icon-remove"></i>删除</span>'
            s += `<div class="item" data-key="${k}"><img src="${getFavicon(v.url)}"><a href="${v.url}">${v.title}</a>${deleteBut}</div>`
        })
        s += '</div></div>'
    })

    mainEl.innerHTML = s  // 将生成的HTML插入页面

    // 为标签页项添加点击事件（打开单个标签页）
    mainEl.querySelectorAll('.item').forEach(el => {
        el.addEventListener('click', function () {
            open(this.querySelector('a').href)  // 打开标签页

            // 如果没有上锁，从收纳列表中删除该标签页
            let p = this.parentNode.parentNode
            let d = this
            let pkey = p.dataset.key
            let ikey = d.dataset.key
            if (!tabList[pkey].locked) {
                d.remove()  // 从DOM中移除
                tabList[pkey].tabs.splice(ikey, 1)  // 从数据中删除
                if (tabList[pkey].tabs.length < 1) delete tabList[pkey]  // 如果组为空，删除整个组
                saveStorage(tabList)  // 保存更改
                init()  // 重新初始化界面
            }
        })
    })

    // 阻止标签页链接的默认行为
    mainEl.querySelectorAll('.item a').forEach(el => {
        el.addEventListener('click', e => e.preventDefault())
    })

    // 打开全部按钮事件
    mainEl.querySelectorAll('.card_title [data-action="openAll"]').forEach(el => {
        el.addEventListener('click', function () {
            let p = this.parentNode.parentNode
            // 打开组内的所有标签页
            p.querySelectorAll('.item a').forEach(aEl => {
                open(aEl.href)
            })

            // 如果没有上锁，删除整个收纳组
            if (!tabList[p.dataset.key].locked) {
                p.remove()
                delete tabList[p.dataset.key]
                saveStorage(tabList)
            }
        })
    })

    // 删除单个标签页按钮事件
    mainEl.querySelectorAll('.item [data-action="delete"]').forEach(el => {
        el.addEventListener('click', function (e) {
            e.stopPropagation()  // 阻止事件冒泡
            e.preventDefault()
            let p = this.parentNode.parentNode.parentNode
            let d = this.parentNode
            let pkey = p.dataset.key
            let ikey = d.dataset.key
            if (tabList[pkey]?.tabs) {
                d.remove()
                tabList[pkey].tabs.splice(ikey, 1)
                if (tabList[pkey].tabs.length < 1) delete tabList[pkey]
                saveStorage(tabList)
                init()
            }
        })
    })

    // 删除整个收纳组按钮事件
    mainEl.querySelectorAll('.card_title [data-action="deleteAll"]').forEach(el => {
        el.addEventListener('click', function () {
            if (!confirm("您确定要删除这些标签页吗？")) return  // 确认对话框
            let p = this.parentNode.parentNode.parentNode
            p.remove()

            // 删除数据
            delete tabList[p.dataset.key]
            saveStorage(tabList)
        })
    })

    // 锁定/解锁按钮事件
    mainEl.querySelectorAll('.card_title [data-action="lock"]').forEach(el => {
        el.addEventListener('click', function () {
            let p = this.parentNode.parentNode.parentNode
            let pkey = p.dataset.key
            if (tabList[pkey]) {
                tabList[pkey].locked = !tabList[pkey].locked  // 切换锁定状态
                saveStorage(tabList)
                init()
            }
        })
    })

    // 置顶/撤顶按钮事件
    mainEl.querySelectorAll('.card_title [data-action="topping"]').forEach(el => {
        el.addEventListener('click', function () {
            let p = this.parentNode.parentNode.parentNode
            let pkey = p.dataset.key
            if (tabList[pkey]) {
                let val = !tabList[pkey].topped  // 切换置顶状态
                tabList[pkey].topped = val
                tabList[pkey].toppedDate = val ? Date.now() : 0  // 设置或清除置顶时间
                saveStorage(tabList)
                init()
            }
        })
    })

    // 重命名按钮事件
    mainEl.querySelectorAll('.card_title [data-action="rename"]').forEach(el => {
        el.addEventListener('click', function () {
            let tEl = this.parentNode.parentNode.querySelector('.item_title')
            tEl.setAttribute('contenteditable', true)  // 设置为可编辑
            tEl.focus()  // 聚焦到标题元素
        })
    })

    // 标题编辑完成事件
    mainEl.querySelectorAll('.item_title').forEach(el => {
        let fun = function (el) {
            let p = el.parentNode.parentNode
            let pkey = p.dataset.key
            if (tabList[pkey]) {
                let title = el.innerText.replace(/\n/g, '') || getTitle(Number(pkey))  // 获取新标题，如果为空则使用默认
                tabList[pkey].title = title
                el.innerText = title
                el.setAttribute('contenteditable', false)  // 取消可编辑
                saveStorage(tabList)
            }
        }
        el.addEventListener('blur', () => fun(el))  // 失去焦点时保存
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter') {  // 按Enter键保存
                e.preventDefault()
                fun(el)
            }
        })
    })

    // 为可拖动的元素设置draggable属性
    mainEl.querySelectorAll('img,a').forEach(e => e.setAttribute('draggable', 'false'))  // 禁止拖动
    mainEl.querySelectorAll('.card_items[data-locked="false"] .item').forEach(el => el.setAttribute('draggable', 'true'))
}

/**
 * 初始化拖放功能
 * 允许用户通过拖放重新排列收纳组内的标签页
 */
function initDrag() {
    let className = 'item'  // 拖放元素的类名
    let dragEl, dragPkey, dragIkey  // 当前拖动的元素及其位置信息
    let dropEl  // 放置目标元素
    let shadowEl  // 拖放时的阴影占位符

    // 检查元素是否是指定的拖放元素
    let checkEl = function (el, deep) {
        deep = deep || 3
        while (el) {
            if (el.className === className) return el
            if (deep < 1) return false
            deep--
            el = el.parentNode
        }
        return false
    }

    // 开始拖动
    document.addEventListener("dragstart", function (e) {
        let el = checkEl(e.target)
        if (!el) return
        el.style.opacity = '.5'  // 半透明效果
        addClass(el.parentNode, 'drag')  // 隐藏删除按钮
        dragEl = el
        dragPkey = el.parentNode.parentNode.dataset.key
        dragIkey = el.dataset.key

        // 创建阴影占位符
        shadowEl = document.createElement('div')
        shadowEl.style.width = el.offsetWidth + 'px'
        shadowEl.style.height = el.offsetHeight + 'px'
        shadowEl.style.background = '#f8f9fa'
        shadowEl.style.border = '1px dashed #444'
        shadowEl.setAttribute('data-shadow', 'true')
    })

    // 结束拖动
    document.addEventListener("dragend", function (e) {
        if (!dragEl) return
        dragEl.style.opacity = ''  // 恢复不透明度
        dragEl.style.display = ''  // 显示元素
        rmClass(dragEl.parentNode, 'drag')  // 显示删除按钮
        dragEl = null
        dropEl = null
        shadowEl = null
        document.querySelectorAll('[data-shadow="true"]').forEach(el => el.remove())  // 清理阴影占位符
    })

    // 进入可放置区域
    document.addEventListener("dragenter", function (e) {
        let el = checkEl(e.target)
        if (!dragEl || !el || dragEl === el || el.parentNode.dataset.locked === 'true') return
        dropEl = el
    })

    // 在可放置区域上方移动
    document.addEventListener("dragover", function (e) {
        if (!dragEl || !dropEl || !shadowEl) return
        e.preventDefault()  // 阻止默认行为以启用drop

        // 根据鼠标位置决定放置位置（上方或下方）
        let y = dropEl.offsetTop + (dropEl.offsetHeight / 2)
        if (e.pageY < y) {
            dropEl.insertAdjacentElement('beforebegin', shadowEl)
        } else {
            dropEl.insertAdjacentElement('afterend', shadowEl)
        }
        dragEl.style.display = 'none'  // 隐藏拖动中的元素
    })

    // 放置元素
    document.addEventListener("drop", function (e) {
        if (!dragEl || !dropEl || !shadowEl) return
        e.preventDefault()
        shadowEl.parentNode.replaceChild(dragEl, shadowEl)  // 用拖动元素替换阴影占位符

        // 计算新位置
        let prevEl = dragEl.previousSibling
        let ikey = prevEl && prevEl.className === className ? Number(prevEl.dataset.key) + 1 : 0
        let pkey = dragEl.parentNode.parentNode.dataset.key
        let val = tabList[dragPkey].tabs[dragIkey]

        // 如果目标组未锁定，执行移动操作
        if (!tabList[pkey]?.locked && val) {
            tabList[dragPkey].tabs.splice(dragIkey, 1)  // 从原位置删除
            tabList[pkey].tabs.splice(ikey, 0, val)    // 插入到新位置
            if (tabList[dragPkey].tabs.length < 1) delete tabList[dragPkey]  // 如果原组为空，删除整个组
            saveStorage(tabList)
            init()
        }
    })
}

/**
 * 初始化导出功能
 * 将收纳列表导出为JSON文件
 */
function initExport() {
    let el = document.querySelector('#export')
    el.addEventListener('click', function () {
        // 创建Blob对象并生成下载链接
        let blob = new Blob([JSON.stringify(tabList, null, 2)], {type: 'application/json'})
        el.href = window.URL.createObjectURL(blob)
        el.download = `梦想标签收纳盒数据备份_${getDate().replace(/\D/g, '')}.json`  // 生成带时间戳的文件名
    })
}

/**
 * 初始化导入功能
 * 从JSON文件导入收纳列表数据
 */
function initImport() {
    let el = document.querySelector('#import')
    el.addEventListener('click', function () {
        // 创建文件选择输入框
        let inp = document.createElement('input')
        inp.type = 'file'
        inp.accept = 'application/json'  // 只接受JSON文件

        inp.onchange = function () {
            let files = this.files
            if (files.length < 1) return
            let f = files[0]
            if (f.type !== 'application/json') return

            // 读取文件内容
            let reader = new FileReader()
            reader.onload = function (e) {
                let data
                try {
                    data = JSON.parse(e.target.result)
                } catch (e) {
                }
                if (!data) return

                // 合并数据并保存
                tabList = Object.assign(tabList, data)
                saveStorage(tabList)
                init()
            }
            reader.readAsText(f)
        }
        inp.click()
    })
}

/**
 * 获取网站的favicon图标URL
 * @param {string} url - 网站URL
 * @returns {string} favicon图标URL
 */
function getFavicon(url) {
    if (isFirefox) {
        // Firefox使用Google的favicon服务
        return 'https://s2.googleusercontent.com/s2/favicons?domain=' + (url.indexOf('http') === 0 ? (new URL(url)).host : 'localhost')
    } else {
        // Chrome使用内置的favicon协议
        let origin = ''
        try {
            origin = (new URL(url)).origin || ''
        } catch (e) {
        }
        return 'chrome://favicon/' + origin
    }
}
