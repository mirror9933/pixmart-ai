/**
 * Convert an UploadedFile (with blob dataUrl) to a base64 data URL string.
 * Uses canvas to read the already-loaded blob URL — no filesystem access needed.
 */
export async function uploadToBase64(uploaded: { dataUrl: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas 2d context unavailable'))
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = () => reject(new Error(`Failed to load image from blob`))
    img.src = uploaded.dataUrl
  })
}

export async function uploadsToBase64(uploaded: { dataUrl: string }[]): Promise<string[]> {
  return Promise.all(uploaded.map(uploadToBase64))
}
