function getFileSize(filePath) {
  return new Promise((resolve) => {
    if (!filePath || typeof wx.getFileInfo !== "function") return resolve(0)
    wx.getFileInfo({
      filePath,
      success: (res) => resolve(Number(res.size) || 0),
      fail: () => resolve(0)
    })
  })
}

function compressImageOnce(filePath, options) {
  return new Promise((resolve) => {
    if (typeof wx.compressImage !== "function") return resolve(filePath)
    wx.compressImage({
      src: filePath,
      quality: options.quality,
      compressedWidth: options.maxWidth,
      success: (res) => resolve(res.tempFilePath || filePath),
      fail: () => resolve(filePath)
    })
  })
}

async function compressForUpload(filePath) {
  if (!filePath) return filePath
  const SIZE_LIMIT = 2 * 1024 * 1024
  const TARGET = Math.round(SIZE_LIMIT * 0.7)
  const initialSize = await getFileSize(filePath)
  if (initialSize && initialSize <= SIZE_LIMIT) return filePath
  const qualitySteps = [80, 65, 50, 40]
  const widthSteps = [1920, 1600, 1280, 1024]
  let current = filePath
  for (let i = 0; i < qualitySteps.length; i += 1) {
    current = await compressImageOnce(current, { quality: qualitySteps[i], maxWidth: widthSteps[i] })
    const size = await getFileSize(current)
    if (size && size <= SIZE_LIMIT) {
      console.info(`[image-helper] compressed from ${initialSize} to ${size} (q=${qualitySteps[i]}, w=${widthSteps[i]})`)
      return current
    }
  }
  console.warn(`[image-helper] could not shrink under 2MB, final size=${await getFileSize(current)}`)
  return current
}

module.exports = { compressForUpload, getFileSize }
