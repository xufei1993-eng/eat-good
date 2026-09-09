Page({
  data: { nickname: "", agreed: false, loading: false },
  updateNickname(e) { this.setData({ nickname: String(e.detail.value || "").trim() }) },
  toggleAgreement() { this.setData({ agreed: !this.data.agreed }) },
  authorizeLogin() {
    if (!this.data.agreed) return wx.showToast({ title: "请先同意隐私说明", icon: "none" })
    this.setData({ loading: true })
    const app = getApp()
    // 微信身份登录不需要读取头像/昵称。昵称在建档页由用户主动填写，
    // 这样协议弹窗完成后的异步回调不会触发 getUserProfile 手势限制。
    const ensurePrivacy = () => new Promise((resolve, reject) => {
      if (typeof wx.requirePrivacyAuthorize !== "function") return resolve()
      wx.requirePrivacyAuthorize({ success: resolve, fail: reject })
    })
    ensurePrivacy().then(() => app.initAuth({})).then((user) => {
      if (!user) throw new Error("登录失败")
      wx.reLaunch({ url: user.profileCompleted ? "/pages/today/today" : "/pages/preferences/preferences?onboarding=1" })
    }).catch((error) => {
      this.setData({ loading: false })
      const message = String(error && (error.errMsg || error.message) || "")
      if (message.indexOf("cancel") >= 0 || message.indexOf("取消") >= 0) {
        wx.showToast({ title: "你已取消微信授权", icon: "none" })
        return
      }
      wx.showModal({ title: "登录暂时失败", content: message || "请确认 auth 云函数已部署、云环境配置正确后重试。", showCancel: false })
    })
  }
})
