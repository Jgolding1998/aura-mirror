"""Reduced-resolution FASHN inference for Windows PCs without CUDA."""
from pathlib import Path

import torch
from fashn_vton import TryOnPipeline
from fashn_vton.tryon_mmdit import TryOnModel
from safetensors import safe_open
from torch import nn
from torch.nn import functional as F


class CpuLinear(nn.Linear):
    def forward(self, features):
        # Keep the checkpoint's compact weights and multiply in float32 on CPU.
        return F.linear(features, self.weight.float(), self.bias)


class CpuTryOnModel(TryOnModel):
    def forward_for_cfg(self, *args, **kwargs):
        # The CPU preset uses guidance 1, so the unconditional pass is redundant.
        prediction = self(*args, **kwargs)["x"]
        return {"v_c": prediction, "v_u": prediction}


class CpuTryOnPipeline(TryOnPipeline):
    def _setup_tryon_model(self):
        # Load one layer at a time to avoid materializing a full FP32 checkpoint.
        with torch.device("meta"):
            model = CpuTryOnModel(input_shape=(504, 336))
        weights = Path(self.weights_dir) / "model.safetensors"
        with safe_open(weights, framework="pt", device="cpu") as checkpoint:
            for name, module in model.named_modules():
                prefix = f"{name}." if name else ""
                linear = isinstance(module, nn.Linear)
                state = {}
                for key, _ in (
                    *module.named_parameters(recurse=False),
                    *module.named_buffers(recurse=False),
                ):
                    tensor = checkpoint.get_tensor(prefix + key)
                    state[key] = tensor if linear and key == "weight" else tensor.float()
                if not state:
                    continue
                if linear:
                    replacement = CpuLinear(
                        module.in_features, module.out_features,
                        bias=module.bias is not None, device="meta",
                    )
                    replacement.load_state_dict(state, assign=True)
                    parent, _, child = name.rpartition(".")
                    setattr(model.get_submodule(parent), child, replacement)
                else:
                    module.load_state_dict(state, strict=False, assign=True)
        self.tryon_model = model.eval()
