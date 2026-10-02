# v1.0.1 acceptance

验证日期：2026-09-23。

## Interface and extraction refinement

- 20 项 Node 回归检查，包括重复分隔线清理、密集渐变简化、宽黑色区间与突变位置保留、连续渐变不误判为密集分档、剪贴板文件读取。
- 新增模拟的 120 档气象配色图片，经过缩略图检测及原图采样后，PNG 为 30 个节点（精细模式 236），JPEG 为 58 个节点（精细模式 667）。这些结果属于测试图，不是用户附件的原始色表恢复。
- 图片默认不上传；Ctrl+V / ⌘V、粘贴按钮与文件选择共用读取流程。高级参数和数值范围折叠，错误范围停止导出旧结果。
- 独立界面随附 MiSans 网页字体及许可证；网站使用原生公共导航、页脚，不再通过 iframe 嵌入。
- Edge 线上实测 Ctrl+V 载入 19×960 的密集测试色条，简洁／细节模式切换为 30／236 节点；普通渐变示例为 6 个节点。原图与重建配色已目视核对，数值错误及修正后恢复导出也已验证。扩展未授权自动选择本地文件，未修改此权限。

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
python tests/dense_image_check.py
```

两个 Python 测试需要 Matplotlib、NumPy、Pillow；应用本身无需这些依赖。

## Distribute

公开静态包包含 `index.html`、`style.css`、`src`、测试及说明文档，不再分发本地 MiSans 字体文件。解压后直接打开 `index.html`；也可以部署在任意静态目录。无需安装、登录或上传图片。上述历史验收中的字体说明仅描述当时的本地界面。
