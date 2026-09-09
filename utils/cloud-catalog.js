const { dishMeasureUnit, dishServingAmount } = require("./dish-catalog")

function normalizeCloudItem(item = {}) {
  const nutrition = item.nutrition || item
  const cloudImageUrl = item.imageUrl || item.image || item.coverUrl || ""
  const normalized = {
    ...item,
    id: item._id || item.id,
    title: item.name || item.title,
    imageUrl: item.displayImageUrl || cloudImageUrl,
    cloudImageUrl,
    foodsText: item.description || item.foodsText || (Array.isArray(item.ingredients) ? item.ingredients.map((entry) => `${entry.name || entry.title || ""} ${entry.grams || ""}g`).join(" · ") : ""),
    unit: item.servingUnit || item.unit || "标准份",
    servingGrams: Number(item.servingGrams) || 0,
    servingAmount: Number(item.servingAmount) || 0,
    measureUnit: item.measureUnit || "",
    kcal: Number(nutrition.kcal) || 0,
    protein: Number(nutrition.protein) || 0,
    carbs: Number(nutrition.carbs) || 0,
    fat: Number(nutrition.fat) || 0,
    fiber: Number(nutrition.fiber) || 0,
    searchText: `${item.name || item.title || ""} ${(item.aliases || []).join(" ")} ${item.description || ""}`.toLowerCase()
  }
  normalized.measureUnit = dishMeasureUnit(normalized)
  normalized.servingAmount = dishServingAmount(normalized)
  return normalized
}

function loadCloudCatalog(type = "dish") {
  if (!wx.cloud || !wx.cloud.callFunction) return Promise.resolve([])
  return wx.cloud.callFunction({ name: "catalog", data: { action: "list", type, status: "online", page: 1, pageSize: 100 } })
    .then((response) => {
      const items = (response.result && response.result.ok ? response.result.items || [] : []).map(normalizeCloudItem)
      if (items.length && wx.setStorageSync) wx.setStorageSync(`cloudCatalog:${type}`, items)
      return items
    })
    .catch(() => [])
}

function searchCloudCatalog(type = "dish", options = {}) {
  if (!wx.cloud || !wx.cloud.callFunction) return Promise.resolve({ items: [], total: 0, hasMore: false })
  const data = {
    action: "list",
    type,
    status: "online",
    keyword: String(options.keyword || "").trim(),
    cuisine: options.cuisine && options.cuisine !== "全部" ? options.cuisine : "",
    tag: options.tag && options.tag !== "全部" ? options.tag : "",
    category: options.category && options.category !== "全部" ? options.category : "",
    page: Math.max(Number(options.page) || 1, 1),
    pageSize: Math.min(Math.max(Number(options.pageSize) || 20, 1), 100)
  }
  return wx.cloud.callFunction({ name: "catalog", data })
    .then((response) => {
      const result = response.result && response.result.ok ? response.result : {}
      return {
        items: (result.items || []).map(normalizeCloudItem),
        total: Number(result.total) || 0,
        page: Number(result.page) || data.page,
        pageSize: Number(result.pageSize) || data.pageSize,
        hasMore: Boolean(result.hasMore)
      }
    })
    .catch(() => ({ items: [], total: 0, page: data.page, pageSize: data.pageSize, hasMore: false }))
}

module.exports = { loadCloudCatalog, searchCloudCatalog, normalizeCloudItem }
