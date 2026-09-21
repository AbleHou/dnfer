"""S3 兼容公开读桶：头像上传/删除。boto3 延迟导入，未配置/未安装不影响其余功能。"""
from uuid import uuid4

from botocore.config import Config

from .config import settings

_client = None

def _get_client():
    global _client
    if _client is None:
        import boto3
        # 阿里云 OSS 兼容要点：
        # 1) addressing_style=virtual —— 虚拟主机式访问（bucket.region.aliyuncs.com），
        #    boto3 自定义 endpoint_url 默认路径式会被 OSS 拒绝（SecondLevelDomainForbidden）；
        # 2) payload_signing_enabled=False —— 禁用 payload 流式签名，OSS 不支持
        #    STREAMING-UNSIGNED-PAYLOAD-TRAILER（NotImplemented）；
        # 3) request_checksum_calculation=when_required —— 避免默认给 put_object 附加
        #    checksum trailer（OSS 不支持）。
        _client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint or None,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region or None,
            config=Config(
                s3={"addressing_style": "virtual", "payload_signing_enabled": False},
                request_checksum_calculation="when_required",
            ),
        )
    return _client

def s3_configured() -> bool:
    return bool(settings.s3_endpoint and settings.s3_access_key
                and settings.s3_secret_key and settings.s3_bucket
                and settings.s3_public_base)

def upload_avatar(user_id: int, ext: str, data: bytes, content_type: str) -> str:
    key = f"avatars/{user_id}/{uuid4().hex}.{ext}"
    _get_client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data,
                             ContentType=content_type, ACL="public-read")
    return f"{settings.s3_public_base.rstrip('/')}/{key}"

def delete_avatar(url: str) -> None:
    """best-effort 删除旧头像对象；URL 不在公开前缀下或删除失败均忽略。"""
    base = settings.s3_public_base.rstrip("/")
    if not url.startswith(base + "/"):
        return
    key = url[len(base) + 1:]
    try:
        _get_client().delete_object(Bucket=settings.s3_bucket, Key=key)
    except Exception:
        pass
