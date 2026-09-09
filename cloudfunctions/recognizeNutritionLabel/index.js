const cloud = require("wx-server-sdk")
const tencentcloud = require("tencentcloud-sdk-nodejs")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function firstNumberAfter(text, labels, units) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[^\\d]{0,18}(\\d+(?:\\.\\d+)?)\\s*(?:${units})`, "i")
    const matched = text.match(pattern)
    if (matched) return Number(matched[1])
  }
  return null
}

function parseNutrition(lines) {
  const text = lines.join(" ").replace(/,/g, ".").replace(/／/g, "/")
  const energyKj = firstNumberAfter(text, ["能量", "热量"], "kJ|KJ|千焦")
  const energyKcal = firstNumberAfter(text, ["能量", "热量"], "kcal|KCAL|千卡|大卡")
  const result = {
    kcal: energyKcal != null ? Math.round(energyKcal) : energyKj != null ? Math.round(energyKj / 4.184) : null,
    protein: firstNumberAfter(text, ["蛋白质"], "g|克"),
    carbs: firstNumberAfter(text, ["碳水化合物", "碳水"], "g|克"),
    fat: firstNumberAfter(text, ["脂肪"], "g|克"),
    fiber: firstNumberAfter(text, ["膳食纤维"], "g|克")
  }
  return { ...result, recognizedCount: Object.values(result).filter((value) => value != null).length }
}

exports.main = async (event) => {
  if (!event.fileID) return { ok: false, message: "没有收到营养标签图片。" }
  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) return { ok: false, message: "请先配置腾讯云 OCR 密钥。" }

  const downloaded = await cloud.downloadFile({ fileID: event.fileID })
  const imageBase64 = downloaded.fileContent.toString("base64")
  const OcrClient = tencentcloud.ocr.v20181119.Client
  const client = new OcrClient({ credential: { secretId, secretKey }, region: "ap-guangzhou", profile: { httpProfile: { endpoint: "ocr.tencentcloudapi.com" } } })

  try {
    const response = await client.GeneralBasicOCR({ ImageBase64: imageBase64, LanguageType: "zh" })
    const lines = (response.TextDetections || []).map((item) => item.DetectedText).filter(Boolean)
    if (!lines.length) return { ok: false, message: "没有识别到文字，请正对营养成分表重新拍摄。" }
    const nutrition = parseNutrition(lines)
    return { ok: true, nutrition, rawText: lines.join("\n") }
  } catch (error) {
    console.error("OCR failed", error)
    return { ok: false, message: error.message || "营养标签识别失败。" }
  }
}
