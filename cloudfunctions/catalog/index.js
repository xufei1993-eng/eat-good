const cloud = require("wx-server-sdk")
const crypto = require("crypto")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const COLLECTIONS = { food: "foods", dish: "dishes" }

function clean(value, fallback = "") {
  return String(value == null ? fallback : value).trim().slice(0, 200)
}

function normalizeNutrition(value = {}) {
  const keys = ["kcal", "protein", "carbs", "fat", "fiber", "sugar", "saturatedFat", "transFat", "sodium", "potassium", "calcium", "iron", "vitaminD", "vitaminB6", "vitaminB12", "cholesterol"]
  return keys.reduce((result, key) => {
    const number = Number(value[key])
    result[key] = Number.isFinite(number) && number >= 0 ? number : 0
    return result
  }, {})
}

function normalizeItem(input = {}, type) {
  const nutrition = normalizeNutrition(input.nutrition || input)
  const aliases = Array.isArray(input.aliases) ? input.aliases : clean(input.aliases).split(/[，,\n]/)
  const description = clean(input.description)
  const explicitMeasureUnit = clean(input.measureUnit).toLowerCase()
  const descriptionWithoutMl = description.replace(/\d+(?:\.\d+)?\s*ml\b/gi, "")
  const inferredLiquid = /\d+(?:\.\d+)?\s*ml\b/i.test(description) && !/\d+(?:\.\d+)?\s*g\b/i.test(descriptionWithoutMl)
  const measureUnit = explicitMeasureUnit === "ml" || (!explicitMeasureUnit && inferredLiquid) ? "ml" : "g"
  const describedAmounts = (description.match(measureUnit === "ml" ? /\d+(?:\.\d+)?\s*ml\b/gi : /\d+(?:\.\d+)?\s*g\b/gi) || []).map((value) => Number.parseFloat(value)).filter((value) => value > 0)
  const describedAmount = describedAmounts.reduce((sum, value) => sum + value, 0)
  const explicitAmount = Number(input.servingAmount)
  const legacyGrams = Number(input.servingGrams)
  const servingAmount = explicitAmount > 0 ? explicitAmount : (measureUnit === "ml" ? describedAmount : legacyGrams || describedAmount) || 100
  const name = clean(input.name || input.title, "未命名")
  const normalizedAliases = aliases.map((item) => clean(item)).filter(Boolean).slice(0, 20)
  const category = clean(input.category, type === "food" ? "基础食物" : "菜品")
  const cuisine = clean(input.cuisine)
  const tags = Array.isArray(input.tags) ? input.tags.map((item) => clean(item)).filter(Boolean).slice(0, 30) : []
  return {
    type,
    name,
    aliases: normalizedAliases,
    category,
    cuisine,
    slot: clean(input.slot, "all"),
    servingUnit: clean(input.servingUnit, "标准份"),
    servingAmount,
    measureUnit,
    servingGrams: measureUnit === "g" ? (legacyGrams > 0 ? legacyGrams : servingAmount) : 0,
    ingredients: Array.isArray(input.ingredients) ? input.ingredients.slice(0, 50) : [],
    tags,
    allergens: Array.isArray(input.allergens) ? input.allergens.map((item) => clean(item)).filter(Boolean).slice(0, 20) : [],
    description,
    imageUrl: clean(input.imageUrl || input.image || input.coverUrl),
    source: clean(input.source),
    sourceKey: clean(input.sourceKey),
    searchText: clean([name, ...normalizedAliases, category, cuisine, description, ...tags].join(" ").toLowerCase()),
    nutrition,
    status: input.status === "offline" ? "offline" : "online",
    updatedAt: db.serverDate(),
    updatedBy: (cloud.getWXContext().OPENID || "admin").slice(0, 80)
  }
}

function canManage(event) {
  const expected = String(process.env.CATALOG_ADMIN_TOKEN || "")
  return Boolean(expected) && String(event.adminToken || "") === expected
}

async function attachDisplayImageUrls(items) {
  const fileIDs = [...new Set(items.map((item) => item.imageUrl).filter((url) => String(url || "").startsWith("cloud://")))]
  if (!fileIDs.length) return items
  try {
    const urls = {}
    for (let index = 0; index < fileIDs.length; index += 50) {
      const result = await cloud.getTempFileURL({ fileList: fileIDs.slice(index, index + 50) })
      ;(result.fileList || []).forEach((file) => { urls[file.fileID] = file.tempFileURL || file.fileID })
    }
    return items.map((item) => ({ ...item, displayImageUrl: urls[item.imageUrl] || item.imageUrl || "" }))
  } catch (error) {
    return items
  }
}

exports.main = async (event = {}) => {
  if (event.action === "getSettings") {
    try { const result = await db.collection("app_settings").doc("general").get(); return { ok: true, settings: result.data || { monthlyPhotoLimit: 5 } } } catch (error) { return { ok: true, settings: { monthlyPhotoLimit: 5 } } }
  }
  if (event.action === "saveSettings") {
    if (!canManage(event)) return { ok: false, code: "UNAUTHORIZED", message: "管理密钥无效" }
    const requestedLimit = Number(event.settings && event.settings.monthlyPhotoLimit)
    const monthlyPhotoLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 0), 999) : 5
    try {
      await db.collection("app_settings").doc("general").set({ data: { monthlyPhotoLimit, updatedAt: db.serverDate(), updatedBy: (cloud.getWXContext().OPENID || "admin").slice(0, 80) } })
    } catch (error) {
      const rawMessage = String(error && (error.errMsg || error.message) || "")
      if (/collection not exists|Db or Table not exist/i.test(rawMessage)) {
        return { ok: false, code: "SETTINGS_COLLECTION_NOT_FOUND", message: "数据库缺少 app_settings 集合，请先在 CloudBase 数据库中创建该集合后再保存。" }
      }
      throw error
    }
    return { ok: true, settings: { monthlyPhotoLimit } }
  }
  const type = event.type === "food" ? "food" : "dish"
  const collection = db.collection(COLLECTIONS[type])
  const action = event.action || "list"
  if (action === "uploadImage") {
    if (!canManage(event)) return { ok: false, code: "UNAUTHORIZED", message: "管理密钥无效或云函数尚未配置 CATALOG_ADMIN_TOKEN" }
    const matches = String(event.dataUrl || "").match(/^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/=]+)$/)
    if (!matches) return { ok: false, message: "仅支持 JPG、PNG 或 WebP 图片" }
    const content = Buffer.from(matches[2], "base64")
    if (!content.length || content.length > 2 * 1024 * 1024) return { ok: false, message: "图片大小不能超过 2MB" }
    const extension = matches[1] === "jpeg" ? "jpg" : matches[1]
    const digest = crypto.createHash("sha1").update(content).digest("hex").slice(0, 20)
    const uploaded = await cloud.uploadFile({ cloudPath: `catalog-images/${Date.now()}-${digest}.${extension}`, fileContent: content })
    const resolved = await attachDisplayImageUrls([{ imageUrl: uploaded.fileID }])
    return { ok: true, fileID: uploaded.fileID, displayImageUrl: resolved[0].displayImageUrl || uploaded.fileID }
  }
  if (action === "list") {
    const keyword = clean(event.keyword)
    const status = event.status === "offline" ? "offline" : event.status === "online" ? "online" : "all"
    const category = clean(event.category)
    const cuisine = clean(event.cuisine)
    const tag = clean(event.tag)
    const conditions = []
    if (status !== "all") conditions.push({ status })
    if (category && category !== "全部") conditions.push({ category })
    if (cuisine && cuisine !== "全部") conditions.push({ cuisine })
    if (tag && tag !== "全部") conditions.push({ tags: tag })
    if (keyword) {
      const regexp = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), options: "i" })
      conditions.push(db.command.or([{ name: regexp }, { searchText: regexp }, { description: regexp }]))
    }
    const query = conditions.length ? collection.where(db.command.and(conditions)) : collection
    const pageSize = Math.min(Math.max(Number(event.pageSize || event.limit) || 20, 1), 100)
    const page = Math.max(Number(event.page) || 1, 1)
    const countResult = await query.count()
    const total = countResult.total || 0
    const result = await query.skip((page - 1) * pageSize).limit(pageSize).get()
    const items = result.data
    const timestamp = (value) => value instanceof Date ? value.getTime() : new Date(value || 0).getTime() || 0
    const sorted = items.sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt))
    return { ok: true, items: await attachDisplayImageUrls(sorted), total, page, pageSize, hasMore: page * pageSize < total }
  }
  if (action === "bulkUpsert") {
    if (!canManage(event)) return { ok: false, code: "UNAUTHORIZED", message: "管理密钥无效或云函数尚未配置 CATALOG_ADMIN_TOKEN" }
    const inputs = Array.isArray(event.items) ? event.items.slice(0, 20) : []
    if (!inputs.length) return { ok: false, message: "没有可导入的数据" }
    const results = await Promise.all(inputs.map(async (input) => {
      const sourceKey = clean(input.sourceKey)
      if (!sourceKey) throw new Error("导入数据缺少 sourceKey")
      const item = normalizeItem({ ...input, source: input.source || "builtin", sourceKey }, type)
      const id = `builtin_${crypto.createHash("sha1").update(`${type}:${sourceKey}`).digest("hex").slice(0, 32)}`
      if (!item.imageUrl) {
        try {
          const existing = await collection.doc(id).get()
          item.imageUrl = existing.data && existing.data.imageUrl ? existing.data.imageUrl : ""
        } catch (error) {}
      }
      await collection.doc(id).set({ data: { ...item, importedAt: db.serverDate() } })
      return id
    }))
    return { ok: true, count: results.length, ids: results }
  }
  if (action === "save") {
    if (!canManage(event)) return { ok: false, code: "UNAUTHORIZED", message: "管理密钥无效或云函数尚未配置 CATALOG_ADMIN_TOKEN" }
    const item = normalizeItem(event.item, type)
    if (!item.name || item.name === "未命名") return { ok: false, message: "名称不能为空" }
    if (event.id) {
      await collection.doc(String(event.id)).update({ data: item })
      return { ok: true, id: String(event.id), item }
    }
    const created = await collection.add({ data: { ...item, createdAt: db.serverDate() } })
    return { ok: true, id: created._id, item: { ...item, _id: created._id } }
  }
  if (action === "toggle") {
    if (!canManage(event)) return { ok: false, code: "UNAUTHORIZED", message: "管理密钥无效或云函数尚未配置 CATALOG_ADMIN_TOKEN" }
    if (!event.id) return { ok: false, message: "缺少记录 ID" }
    const status = event.status === "offline" ? "offline" : "online"
    await collection.doc(String(event.id)).update({ data: { status, updatedAt: db.serverDate(), updatedBy: (cloud.getWXContext().OPENID || "admin").slice(0, 80) } })
    return { ok: true, id: String(event.id), status }
  }
  return { ok: false, message: "不支持的操作" }
}
