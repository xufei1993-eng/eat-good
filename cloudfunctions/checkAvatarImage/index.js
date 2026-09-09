const cloud = require("wx-server-sdk")
const crypto = require("crypto")
const https = require("https")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const request = https.request({
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: options.method || "GET",
      headers: options.headers || {}
    }, (response) => {
      const chunks = []
      response.on("data", (chunk) => chunks.push(chunk))
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8")
        let result
        try {
          result = JSON.parse(raw)
        } catch (error) {
          reject(new Error(`微信接口返回了无法解析的结果（HTTP ${response.statusCode}）`))
          return
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(result.errmsg || `微信接口请求失败（HTTP ${response.statusCode}）`))
          return
        }
        resolve(result)
      })
    })
    request.on("error", reject)
    request.setTimeout(10000, () => request.destroy(new Error("微信接口请求超时")))
    if (options.body) request.write(options.body)
    request.end()
  })
}

async function getAccessToken(appId, appSecret) {
  const query = new URLSearchParams({
    grant_type: "client_credential",
    appid: appId,
    secret: appSecret
  })
  const result = await requestJson(`https://api.weixin.qq.com/cgi-bin/token?${query}`)
  if (!result.access_token) {
    const error = new Error(result.errmsg || "微信 access_token 获取失败")
    error.errCode = result.errcode
    throw error
  }
  return result.access_token
}

async function checkImage(accessToken, buffer, contentType) {
  const boundary = `----checkAvatarImage${crypto.randomBytes(12).toString("hex")}`
  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media"; filename="avatar"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  )
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([header, buffer, footer])
  const query = new URLSearchParams({ access_token: accessToken })

  return requestJson(`https://api.weixin.qq.com/wxa/img_sec_check?${query}`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length
    },
    body
  })
}

function resultMessage(result) {
  const code = Number(result && (result.errCode !== undefined ? result.errCode : result.errcode))
  if (code === 0) return { ok: true }
  // 87014 is the usual image-content violation code. Keep the client-facing
  // text intentionally short to match WeChat review requirements.
  if (code === 87014 || code === 87009 || code === 87010) {
    return { ok: false, blocked: true, message: "你发布的内容含违规信息，请更换后重试。" }
  }
  return { ok: false, blocked: false, message: "头像检测暂时失败，请稍后重试。" }
}

exports.main = async (event) => {
  if (!event || !event.fileID) return { ok: false, blocked: false, message: "头像检测暂时失败，请稍后重试。" }

  try {
    const appId = process.env.WECHAT_APPID
    const appSecret = process.env.WECHAT_APPSECRET
    if (!appId || !appSecret) throw new Error("缺少 WECHAT_APPID 或 WECHAT_APPSECRET")

    const downloaded = await cloud.downloadFile({ fileID: event.fileID })
    const buffer = downloaded && downloaded.fileContent
    if (!buffer) return { ok: false, blocked: false, message: "头像检测暂时失败，请稍后重试。" }

    const contentType = String(event.contentType || "image/jpeg").split(";")[0].trim()
    const accessToken = await getAccessToken(appId, appSecret)
    const result = await checkImage(accessToken, buffer, contentType)
    return resultMessage(result)
  } catch (error) {
    const code = error && (error.errCode !== undefined ? error.errCode : error.errcode)
    console.error("checkAvatarImage failed", { code, message: error && error.message, stack: error && error.stack })
    // This is an integration/configuration failure, not a content violation.
    // Keep it separate so the client never tells a compliant user their image
    // was blocked when the OpenAPI permission is simply missing.
    return { ok: false, blocked: false, setupRequired: true, message: "头像检测服务暂时不可用，请稍后重试。" }
  }
}
