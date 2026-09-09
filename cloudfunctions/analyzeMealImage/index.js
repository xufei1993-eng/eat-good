const cloud = require("wx-server-sdk")
const https = require("https")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function requestJson(url, headers, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const request = https.request({ hostname: target.hostname, path: `${target.pathname}${target.search}`, method: "POST", headers: { "Content-Type": "application/json", ...headers } }, (response) => {
      let raw = ""
      response.on("data", (chunk) => { raw += chunk })
      response.on("end", () => {
        try {
          const parsed = JSON.parse(raw)
          if (response.statusCode >= 400) reject(new Error(parsed.error && parsed.error.message || `视觉服务错误 ${response.statusCode}`))
          else resolve(parsed)
        } catch (error) { reject(new Error("视觉服务返回了无法解析的结果")) }
      })
    })
    request.on("error", reject)
    request.write(JSON.stringify(body))
    request.end()
  })
}

function parseModelJson(value) {
  let text = String(value || "").trim()
  // MiniMax may return a visible reasoning block before the answer.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  try { return JSON.parse(text) } catch (error) {}

  // If the model adds prose or emits more than one candidate JSON, select
  // the last balanced object, which is normally its final answer.
  const candidates = []
  let start = -1
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') { quoted = true; continue }
    if (character === "{") {
      if (depth === 0) start = index
      depth += 1
    } else if (character === "}" && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) candidates.push(text.slice(start, index + 1))
    }
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(candidates[index]) } catch (error) {}
  }
  throw new Error("模型返回中没有可解析的 JSON")
}

function normalizeProfile(value = {}) {
  const profileMode = ["fatloss", "pregnancy", "health"].includes(value.profileMode) ? value.profileMode : "health"
  return {
    profileMode,
    trimester: profileMode === "pregnancy" ? Math.max(1, Math.min(3, Number(value.trimester) || 2)) : 0,
    activityLevel: ["low", "medium", "high"].includes(value.activityLevel) ? value.activityLevel : "",
    gestationalDiabetes: profileMode === "pregnancy" && Boolean(value.gestationalDiabetes),
    pregnancyHypertension: profileMode === "pregnancy" && Boolean(value.pregnancyHypertension),
    noSugar: Boolean(value.noSugar),
    allergens: Array.isArray(value.allergens) ? value.allergens.map((item) => String(item).slice(0, 20)).slice(0, 12) : []
  }
}

const NUTRIENT_KEYS = ["fiber", "sugar", "saturatedFat", "transFat", "sodium", "potassium", "calcium", "iron", "vitaminD", "vitaminB6", "vitaminB12", "cholesterol"]

function normalizeNutrients(value = {}) {
  return NUTRIENT_KEYS.reduce((result, key) => {
    const raw = value[key] && typeof value[key] === "object" ? value[key].value : value[key]
    const numericValue = raw === null || raw === undefined || raw === "" ? null : Number(raw)
    result[key] = Number.isFinite(numericValue) && numericValue >= 0 ? Math.round(numericValue * 10) / 10 : null
    return result
  }, {})
}

function nutrientCoverage(nutrients) {
  return NUTRIENT_KEYS.filter((key) => key !== "transFat" && Number(nutrients[key]) > 0).length
}

exports.main = async (event) => {
  const apiKey = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY
  // TokenHub exposes an OpenAI-compatible endpoint. Keep both values
  // configurable so the function can be switched without a code change.
  const apiUrl = process.env.VISION_API_URL || "https://tokenhub.tencentmaas.com/v1/chat/completions"
  const model = process.env.VISION_MODEL || "hy3"
  if (!apiKey) return { ok: false, message: "云函数尚未配置 VISION_API_KEY，请先配置视觉模型密钥。" }
  if (!event.fileID) return { ok: false, message: "没有收到图片文件。" }
  const fileResult = await cloud.getTempFileURL({ fileList: [event.fileID] })
  const imageUrl = fileResult.fileList[0] && fileResult.fileList[0].tempFileURL
  if (!imageUrl) return { ok: false, message: "图片上传成功，但暂时无法读取。" }
  const profile = normalizeProfile(event.profile)
  const roleNames = { fatloss: "减脂塑形", pregnancy: "孕期营养", health: "日常健康" }
  const prompt = `你是严谨的营养记录助手。识别照片中的本餐食物，并结合用户档案给出简短、可执行的饮食建议。

用户档案：${JSON.stringify(profile)}
用户角色：${roleNames[profile.profileMode]}

只返回严格 JSON，不要 markdown，不要解释 JSON。必须使用以下结构，所有营养值均为整张照片所示常见熟食份量的非负数字估算，数字中不要包含单位：
{"dishName":"菜品名","confidence":"高/中/低","score":0到100的整数,"scoreTitle":"恰好四个中文字符的有趣短评","ingredients":[{"name":"食材","grams":数字,"kcal":数字}],"kcal":数字,"protein":数字,"carbs":数字,"fat":数字,"fiber":数字,"nutrients":{"fiber":数字,"sugar":数字,"saturatedFat":数字,"transFat":数字,"sodium":数字,"potassium":数字,"calcium":数字,"iron":数字,"vitaminD":数字,"vitaminB6":数字,"vitaminB12":数字,"cholesterol":数字},"adviceTitle":"与用户角色匹配的建议标题","advice":"80到140字的个性化建议"}

估算单位：蛋白质、碳水、脂肪、膳食纤维、糖、饱和脂肪、反式脂肪用 g；钠、钾、钙、铁、维生素B6、胆固醇用 mg；维生素D、维生素B12用 μg。照片无法精确判断的微量营养素也要依据已识别食材和常见熟食成分给出保守估算，不要伪造过度精确的小数，最多保留1位小数。识别到真实食物后，不得用一串 0 代替估算；只有该营养素在此类食物中确实可忽略时才返回 0。

只列照片中能合理判断的主要食材，不要把餐具和包装算作食材。建议必须结合角色：减脂塑形关注总能量、蛋白质、纤维和饱腹感；孕期关注全熟与食品安全、铁、钙、优质蛋白，并结合妊娠糖尿病或妊娠期高血压标记；日常健康关注食物多样性和三大营养素平衡。若档案含过敏原，发现疑似相关食材时提醒用户确认配料。不得作疾病诊断，不得替代医生方案。`
  const response = await requestJson(apiUrl, { Authorization: `Bearer ${apiKey}` }, { model, temperature: 0.1, max_tokens: 800, thinking: { type: "disabled" }, response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageUrl, detail: "high" } }] }] })
  const content = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content
  try {
    const analysis = parseModelJson(content)
    analysis.nutrients = normalizeNutrients(analysis.nutrients)
    if (analysis.nutrients.fiber === null && Number.isFinite(Number(analysis.fiber))) analysis.nutrients.fiber = Number(analysis.fiber)

    if (nutrientCoverage(analysis.nutrients) < 6) {
      try {
        const repairPrompt = `请补全下面这份餐食识别结果中的营养估算。只返回严格 JSON：{"nutrients":{"fiber":数字,"sugar":数字,"saturatedFat":数字,"transFat":数字,"sodium":数字,"potassium":数字,"calcium":数字,"iron":数字,"vitaminD":数字,"vitaminB6":数字,"vitaminB12":数字,"cholesterol":数字}}。单位规则与上一轮相同。依据菜品、食材和份量给出保守但合理的常见熟食估算，不要用一串0占位，最多保留1位小数。餐食结果：${JSON.stringify({ dishName: analysis.dishName, ingredients: analysis.ingredients, kcal: analysis.kcal, protein: analysis.protein, carbs: analysis.carbs, fat: analysis.fat })}`
        const repairResponse = await requestJson(apiUrl, { Authorization: `Bearer ${apiKey}` }, { model, temperature: 0.1, max_tokens: 450, thinking: { type: "disabled" }, response_format: { type: "json_object" }, messages: [{ role: "user", content: repairPrompt }] })
        const repairContent = repairResponse.choices && repairResponse.choices[0] && repairResponse.choices[0].message && repairResponse.choices[0].message.content
        const repaired = parseModelJson(repairContent)
        const repairedNutrients = normalizeNutrients(repaired.nutrients)
        NUTRIENT_KEYS.forEach((key) => {
          if (repairedNutrients[key] !== null) analysis.nutrients[key] = repairedNutrients[key]
        })
      } catch (repairError) {
        // Keep the valid meal recognition even if optional nutrient completion fails.
      }
    }

    if (nutrientCoverage(analysis.nutrients) < 6) {
      NUTRIENT_KEYS.forEach((key) => {
        if (key !== "transFat" && analysis.nutrients[key] === 0) analysis.nutrients[key] = null
      })
    }
    return { ok: true, analysis }
  } catch (error) {
    return { ok: false, message: "模型返回格式不完整，请重新拍摄或手工记录。" }
  }
}
