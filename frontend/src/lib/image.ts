// 图片上传 MIME 归一化：Safari 等浏览器对 .apng/.webp 等扩展名不映射 MIME，
// File.type 为空或 application/octet-stream，导致后端 MIME 白名单拒绝。
// 上传前按扩展名推断准确 MIME（后端仍按 magic 字节二次校验）。
const EXT_MIME: Record<string, string> = {
  apng: 'image/apng',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export function normalizeImageType(file: File): File {
  if (file.type && file.type !== 'application/octet-stream') return file
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  const mime = EXT_MIME[ext]
  if (!mime) return file
  return new File([file], file.name, { type: mime })
}
