# v1.0.1 acceptance

验证日期：2026-09-23。

- Node 核心回归：14 项通过，覆盖不等距渐变、反转、灰度、分段硬边界、无效数值、对数映射、透明像素、噪声与空白图。
- 真实 Matplotlib 生成的带刻度色条：16 张通过，viridis / coolwarm / gray / turbo，各含横向和纵向、PNG 和 JPEG（质量 75）；检测长轴误差小于 12 像素，RGB 最大重建误差小于 3，并额外检查原始色表两端颜色（RGB 距离小于 25，包含 JPEG 误差）。
- 生成的 Matplotlib 代码：实际执行 3 组，检查连续端点、非等值数值分档和 LogNorm。
- Edge 手工浏览器验收：一键示例、自动框选、6 个不等距控制点，RGB 均方根误差 0.77、最大误差 1.81；预览与代码已核对。

上述是可复现的有限验收集，不是“任意 colorbar”正确率承诺。图片测试产物位于仓库外 `Output/Colorbar-Translator`。OCR 仅为辅助，未通过自动数值标定验收。

## Reproduce

```powershell
npm test
python tests/export_check.py
python tests/image_check.py
```

两个 Python 测试需要 Matplotlib、NumPy、Pillow；应用本身无需这些依赖。

## Distribute

静态包包含 `index.html`、`style.css`、`src`、说明文档。解压后直接打开 `index.html`；也可以部署在任意静态目录。无需安装、登录或上传图片。GitHub 远程仓库的可见性尚待确认，本地仓库已建立。
