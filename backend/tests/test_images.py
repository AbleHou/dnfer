from app.services.images import detect_image, image_content_type, is_apng

PNG_SIG = b"\x89PNG\r\n\x1a\n"


def _chunk(cname: bytes, payload: bytes) -> bytes:
    # 真实 PNG chunk 含 4 字节 CRC；补齐以匹配 is_apng 的 12+length 步进
    return len(payload).to_bytes(4, "big") + cname + payload + b"\x00\x00\x00\x00"


def _ihdr() -> bytes:
    return _chunk(b"IHDR",
                  (1).to_bytes(4, "big") + (1).to_bytes(4, "big") + b"\x08\x06\x00\x00\x00")


def _png(extra: bytes = b"") -> bytes:
    return PNG_SIG + _ihdr() + extra


def _static_png() -> bytes:
    return _png(_chunk(b"IDAT", b""))


def _apng() -> bytes:
    actl = _chunk(b"acTL", (1).to_bytes(4, "big") + (1).to_bytes(4, "big"))
    return _png(actl + _chunk(b"IDAT", b""))


def test_detect_png():
    assert detect_image(PNG_SIG + b"payload") == "png"


def test_detect_apng_returns_png():
    # APNG 与静态 PNG 同签名，detect_image 一律返回 'png'
    assert detect_image(_apng()) == "png"


def test_detect_jpeg():
    assert detect_image(b"\xff\xd8\xff\xe0\x00\x10JFIF") == "jpg"


def test_detect_webp():
    assert detect_image(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "webp"


def test_detect_unknown():
    assert detect_image(b"") is None
    assert detect_image(b"not an image") is None


def test_is_apng_true():
    assert is_apng(_apng()) is True


def test_is_apng_static_false():
    assert is_apng(_static_png()) is False


def test_is_apng_not_png_false():
    assert is_apng(b"garbage") is False


def test_is_apng_only_signature_false():
    assert is_apng(PNG_SIG) is False


def test_image_content_type():
    assert image_content_type("png") == "image/png"
    assert image_content_type("jpg") == "image/jpeg"
    assert image_content_type("webp") == "image/webp"
