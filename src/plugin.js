import { host, PALETTE_AREA } from '@hermes/plugin-sdk'
import { startController } from './controller.js'

export default {
  id: 'hermes-chinese-latex',
  name: '中文行内公式修复',
  defaultEnabled: true,
  register(ctx) {
    const controller = startController(host, ctx)
    ctx.registerMany([
      { id: 'toggle', area: PALETTE_AREA, data: {
        id: 'hermes-chinese-latex.toggle', label: '中文公式：开启／暂停',
        keywords: ['中文', 'latex', 'math', '公式'], run: controller.commands.toggle
      } },
      { id: 'rescan', area: PALETTE_AREA, data: {
        id: 'hermes-chinese-latex.rescan', label: '中文公式：重新扫描当前聊天',
        keywords: ['中文', 'latex', 'math', '公式', '扫描'], run: controller.commands.rescan
      } }
    ])
  }
}
