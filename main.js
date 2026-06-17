// 替换为你的worker域名，末尾不要斜杠
const API_BASE = "https://apirdt.lovefree.de5.net";

// 全局分页缓存总条数，5分钟有效期
let cachedTotal = null;
let cacheExpire = 0;

// DOM元素
const listView = document.getElementById("listView");
const readView = document.getElementById("readView");
const listWrap = document.getElementById("listWrap");
const pageBar = document.getElementById("pageBar");
const syncBtn = document.getElementById("syncBtn");


// 阅读页DOM
const readTitle = document.getElementById("readTitle");
const readAuthor = document.getElementById("readAuthor");
const readTime = document.getElementById("readTime");
const readOrigin = document.getElementById("readOrigin");
const readBody = document.getElementById("readBody");

// 全局分页状态
let currentPage = 1;
const pageSize = 10;

// 页面初始化
window.addEventListener("DOMContentLoaded", handleRoute);
// 监听hash切换（切换列表/阅读页）
window.addEventListener("hashchange", handleRoute);

// 路由分发
function handleRoute() {
    const hash = location.hash.replace("#/", "") || "list";
    const arr = hash.split("?");
    const route = arr[0];
    const params = new URLSearchParams(arr[1] || "");

    // 列表页
    if (route === "list") {
        listView.classList.remove("hidden");
        readView.classList.add("hidden");
        loadStories(currentPage);
    }
    // 阅读详情页
    else if (route === "read") {
        listView.classList.add("hidden");
        readView.classList.remove("hidden");
        const rid = params.get("id");
        if (rid) loadStoryDetail(rid);
    }
}

// 加载分页列表
async function loadStories(page = 1) {
    currentPage = page;
    listWrap.innerHTML = `<div class="loading">加载中...</div>`;
    pageBar.innerHTML = "";

    try {
        const res = await fetch(`${API_BASE}/api/stories?page=${page}&size=${pageSize}`);
        const data = await res.json();

        if (data.error) {
            listWrap.innerHTML = `<div class="empty-tip">${data.error}</div>`;
            return;
        }
        const { list, total: newTotal } = data;

        const now = Date.now();
        let total;
        // 缓存未过期，复用缓存总数
        if (cachedTotal !== null && now < cacheExpire) {
            total = cachedTotal;
        } else {
            // 缓存失效，使用接口新总数，并更新缓存
            total = newTotal;
            cachedTotal = total;
            cacheExpire = now + 5 * 60 * 1000;
        }
        const totalPage = Math.ceil(total / pageSize);

        if (!list || list.length === 0) {
            listWrap.innerHTML = `
                <div class="empty-tip">
                    档案馆暂无数据，请点击上方按钮执行首次同步。
                </div>
            `;
            return;
        }

        // 渲染卡片列表
        let html = "";
        list.forEach(story => {
            const time = new Date(story.created_at).toLocaleString("zh-CN");
            // 摘要截断350字符
            let desc = story.body
                .replace(/&#39;/g, "'")
                .replace(/&#32;/g, " ")
                .replace(/&#x200B;/g, "")
                .replace(/\n\s*\n\s*\n+/g, "\n\n");
            if (desc.length > 350) desc = desc.slice(0, 350) + "...";

            html += `
                <article class="story-card">
                    <a class="story-title" href="#/read?id=${story.reddit_id}">${story.title}</a>
                    <div class="meta">作者: ${story.author} | 📅 归档时间: ${time}</div>
                    <div class="card-desc">${desc}</div>
                    <div class="card-bottom">
                        <a class="card-btn" href="#/read?id=${story.reddit_id}">阅读全文</a>
                        <a class="card-btn" href="${story.url}" target="_blank" rel="noopener noreferrer">前往Reddit原帖</a>
                    </div>
                </article>
            `;
        });
        listWrap.innerHTML = html;

        // 渲染分页按钮
        renderPageBar(totalPage, page);

    } catch (err) {
        listWrap.innerHTML = `<div class="empty-tip">请求接口失败：${err.message}</div>`;
    }
}

// 渲染分页控件
function renderPageBar(totalPage, now) {
    let pageHtml = "";
    // 首页按钮
    pageHtml += `<button class="page-btn" ${now <= 1 ? "disabled" : ""} data-p="1">首页</button>`;
    // 上一页
    pageHtml += `<button class="page-btn" ${now <= 1 ? "disabled" : ""} data-p="${now - 1}">上一页</button>`;
    // 当前页
    pageHtml += `<span style="padding:0 12px;">第 ${now} / ${totalPage} 页</span>`;
    // 下一页
    pageHtml += `<button class="page-btn" ${now >= totalPage ? "disabled" : ""} data-p="${now + 1}">下一页</button>`;
	// 尾页（跳转到最后一页 totalPage）
    pageHtml += `<button class="page-btn" ${now >= totalPage ? "disabled" : ""} data-p="${totalPage}">尾页</button>`;
    pageBar.innerHTML = pageHtml;

    // 分页点击事件
    document.querySelectorAll(".page-btn").forEach(btn => {
        btn.onclick = () => {
            const p = Number(btn.dataset.p);
            loadStories(p);
        };
    });
}

// 加载单篇详情
async function loadStoryDetail(rid) {
    readBody.innerHTML = "<div class='loading'>加载全文...</div>";

    try {
        const res = await fetch(`${API_BASE}/api/story?id=${rid}`);
        const story = await res.json();
        if (story.error) {
            readBody.innerHTML = `<div class="empty-tip">${story.error}</div>`;
            return;
        }
        // 前端兜底清洗：还原转义字符 + 剔除两种尾部垃圾文本
        let fullText = story.body
            .replace(/&#39;/g, "'")
            .replace(/&#32;/g, " ")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
			// 新增删除零宽空格实体
			.replace(/&#x200B;/g, "")
            .replace(/\s*submitted by\s*\/u\/[\w-]+\s*\[link\]\s*\[\w+\]$/gi, "")
            .replace(/\s+\/u\/[\w-]+\s+\[link\]\s+\[comments\]\s*$/gi, "")
			// 新增：把3个及以上换行压缩成2个换行，消除超大空白
			.replace(/\n\s*\n\s*\n+/g, "\n\n")
            .trim();

        // 填充阅读页
        readTitle.textContent = story.title;
        readAuthor.textContent = `作者：${story.author}`;
        readTime.textContent = `归档时间：${new Date(story.created_at).toLocaleString("zh-CN")}`;
        readOrigin.href = story.url;
        // 按双换行分割段落
		const paragraphs = fullText.split(/\n\n/).filter(p => p.trim() !== "");
		let pHtml = "";
		paragraphs.forEach(p => {
			pHtml += `<p>${p}</p>`;
		});
		readBody.innerHTML = pHtml;
    } catch (err) {
        readBody.innerHTML = `<div class="empty-tip">加载失败：${err.message}</div>`;
    }
}

// 同步按钮事件，增加判空，注释按钮也不会报错
if (syncBtn) {
    syncBtn.addEventListener("click", async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = "同步中，请稍等...";
        try {
            const res = await fetch(`${API_BASE}/crawl`);
            const text = await res.text();
            alert(text);
            // 同步新增帖子，清空旧缓存，强制重新获取真实总数
            cachedTotal = null;
            cacheExpire = 0;
            // 同步完成回到第一页刷新
            loadStories(1);
        } catch (err) {
            alert("同步失败：" + err.message);
        } finally {
            syncBtn.disabled = false;
            syncBtn.textContent = "手动同步新故事";
        }
    });
}
