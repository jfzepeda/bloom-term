"""Aplicación FastAPI de Market Sentinel."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import api, db
from app.config import settings

logger = logging.getLogger(__name__)

app = FastAPI(title="Market Sentinel", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Crea las tablas si no existen."""
    db.init_db()
    logger.info("Base de datos inicializada")


app.include_router(api.router, prefix="/api")
