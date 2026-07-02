"""Inserta backend/ en sys.path para que 'from app...' funcione en pytest."""
import sys
from pathlib import Path

BACKEND_DIR = str(Path(__file__).resolve().parent)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
