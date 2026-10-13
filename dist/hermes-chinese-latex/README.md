# Hermes Desktop 中文行内公式修复

独立原生桌面插件 `hermes-chinese-latex`，使用官方 `@hermes/plugin-sdk` 加载。
无需修改或重新编译 Hermes，无需 API Key、模型调用或 CDN。

## 用途

Hermes 的 `escapeCjkProseDollars()` 会将含中文的 `$…$` 开头转义，合法公式也可能显示为源码。
本插件读取当前聊天原文，在消息生成完成后核对显示位置，自动补渲染以下内容：

```latex
$f^{(n)}(0)=n!\cdot(\text{某个含 }n\text{ 的式子})$
$\text{中文}$
$f(x)=\text{某个表达式}$
```

只处理单美元公式；要求中文出现在完整的 `\text`、`\textbf`、`\textit`、`\textrm`、`\textsf`、`\texttt`、`\textnormal` 或 `\mbox` 参数中，并通过 KaTeX 解析。
KaTeX 不支持的命令（例如当前版本中的 `\mbox`）会保留原显示。
代码中的示例、价格、转义美元符号、普通中文 `$变量名`、`$x=变量$` 均不自动修复。
已由 Hermes 渲染的公式、`$$…$$` 和 `math` 围栏不重复处理。

## 安装

### 从 Hermes 安装

在 Hermes 的“技能与工具 → 插件”中使用 **Install from Git**，填入：

```text
https://github.com/NeekoNoNeko/hermes-chinese-latex
```

仓库根目录包含预构建 `plugin.js`，无需自行构建。官方加载机制见 [Desktop Plugin SDK 文档](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk)。

### 从 ZIP 安装（Windows）

从 [Releases](https://github.com/NeekoNoNeko/hermes-chinese-latex/releases/latest) 下载 `hermes-chinese-latex-1.0.0.zip` 和同名 `.sha256`，核对 ZIP 的 SHA256 后，解压完整 ZIP 并运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

指定 Hermes 目录：

```powershell
.\scripts\install.ps1 -HermesHome "$env:LOCALAPPDATA\hermes"
```

脚本优先使用 `HERMES_HOME`，其次 Windows 的 `%LOCALAPPDATA%\hermes`（该目录已有插件根时），最后使用 `~/.hermes`。
安装前后校验 SHA256；覆盖已有版本时先完整备份到 `desktop-plugin-backups/` 并验证备份文件校验值。
也可将发行包的 `plugin.js` 放到 `$HERMES_HOME/desktop-plugins/hermes-chinese-latex/plugin.js`。
Hermes 通常自动加载；如未加载，在命令面板执行 **Reload desktop plugins**，并检查“技能与工具 → 插件”的 Desktop 开关。

## 使用与恢复

默认启用；打开历史聊天或消息生成结束后自动处理。只处理当前已确认归属的聊天；后台聊天在切换过去后处理。
命令面板（Ctrl+K）提供：

- **中文公式：开启／暂停**：保存开关状态；暂停立即恢复 Hermes 原显示。
- **中文公式：重新扫描当前聊天**：重新读取原文并匹配；用于临时断连后的重试。

不改写原始消息，不写会话数据库。插件只创建可撤销的显示副本，保留原块；正常卸载和热重载会清理副本。
链接点击转发到原始节点，保留 Hermes 的链接处理及 Ctrl/Shift 等按键语义。
用户正在选择内容时推迟替换，避免破坏选区。

卸载：

```powershell
.\scripts\uninstall.ps1 -HermesHome "$env:LOCALAPPDATA\hermes"
```

脚本仅删除本插件目录，保留聊天和备份。需要回退旧版时，先卸载当前插件，再将对应备份目录复制回
`desktop-plugins/hermes-chinese-latex`，执行 Reload desktop plugins。

## 边界与兼容性

- 基于本机 Hermes 源码 `dce1e9b375` 的 SDK/DOM，实际客户端验证见 `VERIFICATION.md`。
- 从原文定位，不能唯一匹配时保留原显示；遇到源码接口不可用或结构不兼容会提供一次提示。
- 为避免误改交互内容，包含按钮、媒体等复杂组件的块会跳过。超长消息、图片/HTML/脚注或宿主特殊转换使整段无法匹配时，也可能跳过。
- 使用已修复已知依赖漏洞的 KaTeX 0.18.2；复用宿主公式 CSS/字体，输出 HTML + MathML 和原始 LaTeX annotation。
- 与 `hermes-source-copy` 独立运行，运行时没有插件间依赖。没有原文复制插件时，普通浏览器复制仍由 Hermes 决定；本插件不拦截剪贴板。
- Hermes 升级改变聊天结构时需重新验证兼容性。失败时不尝试猜测或改写内容。

## 开发

需要 Node.js 22+：

```powershell
npm ci
npm run check
npm run package
```

安装用户只需要预构建插件，不需要 Node.js。根目录 `plugin.js` 与 `dist/hermes-chinese-latex/plugin.js` 一致。
`src/vendor/` 复用了 [Hermes Source Copy v1.0.6](https://github.com/NeekoNoNeko/hermes-source-copy/tree/v1.0.6) 的原文映射与历史缓存（MIT），完整许可证保留在该目录及 `THIRD_PARTY_NOTICES.txt`。
复制兼容性测试可通过 `HERMES_SOURCE_COPY_PLUGIN` 指向该插件的预构建 `plugin.js`；缺少时只跳过这一项集成测试。CI 会检出固定版本，在 Windows 和 Linux 运行测试；Windows 额外执行安装、备份和卸载验证。
可选运行 `node scripts/capture-preprocessor.mjs <Hermes源码目录>` 重新生成宿主预处理测试快照，脚本不修改 Hermes 源码。
