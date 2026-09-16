from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .auth import hash_password
from .config import settings
from .db import SessionLocal, init_db
from .models import User
from .routers import auth, members, public, raids
from .ws import router as ws_router

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

try:
    app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="static")
except RuntimeError:
    pass  # 前端未构建时忽略
