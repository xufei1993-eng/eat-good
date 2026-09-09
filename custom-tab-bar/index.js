const config = require("../config/index")

Component({
  data: {
    selected: 0,
    hidden: true,
    tabs: [
      { pagePath: "/pages/today/today", text: "今日" },
      { pagePath: "/pages/history/history", text: "日历" },
      { pagePath: "/pages/preferences/preferences", text: "我的" }
    ]
  },
  lifetimes: {
    attached() { this.syncSelection() },
    ready() { this.syncSelection() }
  },
  pageLifetimes: {
    show() { this.syncSelection() }
  },
  methods: {
    syncSelection() {
      const preferences = wx.getStorageSync("preferences") || {}
      const pages = getCurrentPages()
      const route = pages.length ? `/${pages[pages.length - 1].route}` : ""
      const selected = this.data.tabs.findIndex((item) => item.pagePath === route)
      this.setData({ selected: selected >= 0 ? selected : this.data.selected, hidden: false })
    },
    showForPage(index) {
      const preferences = wx.getStorageSync("preferences") || {}
      this.setData({ selected: index, hidden: false })
    },
    hideForOverlay() {
      this.setData({ hidden: true })
    },
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index)
      this.setData({ selected: index })
      wx.switchTab({ url: this.data.tabs[index].pagePath })
    }
  }
})
