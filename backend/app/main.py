import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.responses import FileResponse

from .auth import hash_password
from .config import settings
from .db import SessionLocal, init_db
from .models import User
from .routers import auth, members, public, raids
from .ws import router as ws_router

logger = logging.getLogger("dnfer")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    if not db.query(User).filter(User.username == settings.admin_username).first():
        db.add(User(username=settings.admin_username,
                    password_hash=hash_password(settings.admin_password),
                    nickname=settings.admin_nickname, is_admin=True))
        db.commit()
    db.close()
    yield

app = FastAPI(title="DNfer", lifespan=lifespan)

app.add_middleware(CORSMiddleware,
                   allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(auth.router)
app.include_router(members.router)
app.include_router(raids.router)
app.include_router(public.router)
app.include_router(ws_router)

class SpaStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code == 404:
                index_path = Path(self.directory) / "index.html"
                if index_path.exists():
                    return FileResponse(index_path)
            raise
        if response.status_code == 404:
            index_path = Path(self.directory) / "index.html"
            if index_path.exists():
                return FileResponse(index_path)
        return response

try:
    app.mount("/", SpaStaticFiles(directory=settings.static_dir, html=True), name="static")
except RuntimeError:
    logger.warning("前端静态目录 %s 不存在，跳过静态托管", settings.static_dir)
