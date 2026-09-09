const config = require("./config/index")
const { isProfileComplete } = require("./utils/profile-calculator")
const { loadCloudCatalog } = require("./utils/cloud-catalog")

App({
  onLaunch() {
    if (config.cloudEnvId && wx.cloud) {
      wx.cloud.init({ env: config.cloudEnvId, traceUser: true })
      Promise.all([loadCloudCatalog("dish"), loadCloudCatalog("food")]).catch(() => {})
    }
    // 首页始终先展示演示数据；登录只从“我的”页由用户主动发起。
  },
  initAuth(profile = {}) {
    console.log("[吃对饭][微信授权] initAuth 输入:", profile)
    if (!config.cloudEnvId || !wx.cloud || typeof wx.login !== "function") return Promise.resolve(null)
    return new Promise((resolve) => {
      wx.login({
        success: (loginResult) => {
          console.log("[吃对饭][微信授权] wx.login 返回:", loginResult)
          if (!loginResult || !loginResult.code) return resolve(null)
          wx.cloud.callFunction({ name: "auth", data: { action: "login", profile } }).then((response) => {
            console.log("[吃对饭][微信授权] auth callFunction 原始返回:", response)
            const result = response && response.result
            if (!result || !result.ok || !result.user) return resolve(null)
            this.globalData.user = result.user
            wx.setStorageSync("authUser", result.user)
            resolve(result.user)
          }).catch(() => resolve(null))
        },
        fail: (error) => { console.error("[吃对饭][微信授权] wx.login 失败:", error); resolve(null) }
      })
    })
  },
  globalData: {
    cloudEnvId: config.cloudEnvId,
    user: wx.getStorageSync("authUser") || null
  }
})
