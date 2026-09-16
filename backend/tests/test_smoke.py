def test_imports():
    from app.config import settings  # noqa: F401
    from app import models  # noqa: F401
    from app import schemas  # noqa: F401
    assert True
