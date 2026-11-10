"""图片上传字节级识别与校验（纯函数，无状态）。

请求放行只依赖 detect_image（APNG 与静态 PNG 同签名，天然被接受）；
is_apng 是「识别」的可测纯函数，不接入请求流，供诊断/未来使用。
"""

PNG_SIG = b"\x89PNG\r\n\x1a\n"
JPEG_SIG = b"\xff\xd8\xff"
WEBP_MAGIC = (b"RIFF", b"WEBP")

_EXT_CONTENT_TYPE = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}


def detect_image(data: bytes) -> str | None:
    """按 magic bytes 识别图片类型，返回 'png'/'jpg'/'webp'，均不命中返回 None。"""
    if data.startswith(PNG_SIG):
        return "png"
    if data.startswith(JPEG_SIG):
        return "jpg"
    if len(data) >= 12 and data[:4] == WEBP_MAGIC[0] and data[8:12] == WEBP_MAGIC[1]:
        return "webp"
    return None


def is_apng(data: bytes) -> bool:
    """识别 APNG：PNG 签名后，acTL chunk 出现在首个 IDAT 之前。"""
    if not data.startswith(PNG_SIG):
        return False
    offset = 8
    while offset + 8 <= len(data):
        length = int.from_bytes(data[offset:offset + 4], "big")
        chunk_type = data[offset + 4:offset + 8]
        if chunk_type == b"acTL":
            return True
        if chunk_type == b"IDAT":
            return False
        offset += 12 + length
    return False


def image_content_type(ext: str) -> str:
    """存储用 ContentType 归一化映射。"""
    return _EXT_CONTENT_TYPE[ext]
