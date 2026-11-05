"""FASHN VTON adapter for CUDA or the reduced-resolution CPU path.

Install instructions and tested boundaries: docs/SETUP.md.
"""
import base64
import binascii
import hmac
import io
import os
import threading
from functools import lru_cache

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image, UnidentifiedImageError

app = FastAPI(title="Aura FASHN try-on adapter", version="0.1.0")
inference_lock = threading.Lock()
Image.MAX_IMAGE_PIXELS = 24_000_000


class TryOnRequest(BaseModel):
    person: str = Field(max_length=17_000_000)
    garment: str = Field(max_length=17_000_000)
    category: str


def authorize(authorization):
    token = os.environ.get("TRYON_SERVICE_TOKEN", "")
    if token and not hmac.compare_digest(authorization or "", f"Bearer {token}"):
        raise HTTPException(401, "Invalid service token")


def decode_image(value):
    try:
        data = base64.b64decode(value, validate=True)
        if len(data) > 12 * 1024 * 1024:
            raise HTTPException(413, "Image is too large")
        image = Image.open(io.BytesIO(data))
        if image.format not in {"PNG", "JPEG", "WEBP"}:
            raise HTTPException(400, "Unsupported image format")
        image.load()
        image.thumbnail((1600, 1600))
        if image.mode == "RGBA":
            background = Image.new("RGB", image.size, "white")
            background.paste(image, mask=image.getchannel("A"))
            return background
        return image.convert("RGB")
    except (ValueError, binascii.Error, UnidentifiedImageError, Image.DecompressionBombError):
        raise HTTPException(400, "Invalid image") from None


@lru_cache(maxsize=1)
def pipeline():
    import torch
    weights_dir = os.environ.get("FASHN_WEIGHTS_DIR", "./weights")
    if os.environ.get("FASHN_DEVICE") == "cpu":
        from cpu import CpuTryOnPipeline
        torch.set_num_threads(6)
        torch.set_num_interop_threads(1)
        return CpuTryOnPipeline(weights_dir, device="cpu")
    if not torch.cuda.is_available():
        raise HTTPException(503, "Set FASHN_DEVICE=cpu for local CPU inference or connect a CUDA host.")
    from fashn_vton import TryOnPipeline
    return TryOnPipeline(weights_dir)


@app.get("/health")
def health():
    return {"ok": True, "provider": "fashn-vton-1.5", "loaded": pipeline.cache_info().currsize > 0}


@app.post("/tryon")
def tryon(request: TryOnRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    if request.category not in {"tops", "bottoms", "one-pieces"}:
        raise HTTPException(400, "Unsupported category")
    person, garment = decode_image(request.person), decode_image(request.garment)
    if not inference_lock.acquire(blocking=False):
        raise HTTPException(429, "Another try-on is running. Please wait.")
    try:
        model = pipeline()
        result = model(
            person_image=person, garment_image=garment, category=request.category,
            garment_photo_type="flat-lay", num_timesteps=12 if model.device.type == "cpu" else 30,
            guidance_scale=1.0 if model.device.type == "cpu" else 1.5,
            segmentation_free=request.category == "bottoms",
        )
        output = io.BytesIO()
        result.images[0].save(output, format="PNG")
        return {"imageBase64": base64.b64encode(output.getvalue()).decode("ascii")}
    finally:
        inference_lock.release()
