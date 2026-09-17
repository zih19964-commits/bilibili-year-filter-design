# 生成 README 的无动画版本。修改动态 SVG 后，在仓库根目录执行本脚本。
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "assets" / "brand"
overrides = {
    "hero": ".recent,.archive,.orbit,.cursor{animation:none!important}.recent{opacity:.34}.cursor{transform:translateX(-380px);opacity:1}",
    "how-it-works": ".signal{animation:none!important}",
}
for name, css in overrides.items():
    source = (root / f"{name}.svg").read_text(encoding="utf-8")
    if source.count("</svg>") != 1:
        raise ValueError(f"{name}.svg 必须是单个完整 SVG")
    result = source.replace("</svg>", f"<style>{css}</style></svg>")
    (root / f"{name}-static.svg").write_text(result, encoding="utf-8")
