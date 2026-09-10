async function canTakePhoto() {
  try {
    const response = await wx.cloud.callFunction({ name: "analyzeMealImage", data: { action: "getQuota" } })
    const result = response.result || {}
    if (!result.ok || !result.quota) throw new Error(result.message || "无法读取拍照额度，请稍后重试")
    console.log("[吃对饭][拍照额度]", result.quota)
    if (result.quota.remaining <= 0) {
      wx.showModal({ title: "本月拍照次数已用完", content: "请下月再使用拍照识别", showCancel: false })
      return false
    }
    return true
  } catch (error) {
    wx.showModal({ title: "暂时无法拍照识别", content: error.message || "无法读取拍照额度，请稍后重试", showCancel: false })
    return false
  }
}

module.exports = { canTakePhoto }
