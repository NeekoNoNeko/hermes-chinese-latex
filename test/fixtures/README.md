# 宿主预处理快照

`sources.json` 是测试输入；`preprocessed.json` 由 `scripts/capture-preprocessor.mjs`
直接调用本机 Hermes 源码 `dce1e9b375` 的 `preprocessMarkdown()` 生成。
脚本对媒体辅助函数使用桩；这些输入没有媒体，不将媒体路径列为已验证能力。

自动测试将预处理后的文本送入 remark/rehype/KaTeX 并生成 jsdom 文档。
这能验证原文匹配和 DOM 显示副本，但不是完整 Hermes 视觉验证。
实际 Hermes Desktop v0.21.6+387 中的公式显示、真实 Ctrl+C 和粘贴验收另见根目录 `VERIFICATION.md`。

`source-copy-integration.test.js` 在旁边存在 `HermesFormulaPlugin/plugin.js` 时加载其完整预构建插件，
只替换 SDK 入口为测试宿主，验证修复后的表格公式完整/部分选中复制。
也可通过 `HERMES_SOURCE_COPY_PLUGIN` 指定该插件文件；没有这个外部测试材料时该项跳过。
生产插件运行不依赖此文件或另一个插件。
