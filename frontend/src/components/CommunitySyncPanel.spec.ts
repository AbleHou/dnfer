// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CommunitySyncPanel from './CommunitySyncPanel.vue'
import type { SyncTask } from '../types'

const { apiMock } = vi.hoisted(() => ({
  apiMock: { syncCreate: vi.fn(), syncLatest: vi.fn() },
}))
vi.mock('../api/client', () => ({
  api: apiMock,
  getToken: vi.fn(), setToken: vi.fn(), clearToken: vi.fn(),
}))
const notifyMock = vi.hoisted(() => ({
  notifyWarning: vi.fn(), notifyError: vi.fn(), notifySuccess: vi.fn(),
}))
vi.mock('../lib/notify', () => notifyMock)

function mkTask(status: SyncTask['status'], result: SyncTask['result'] = null): SyncTask {
  return { taskId: 1, status, communityId: '329230843', message: null, result, createdAt: 'x' }
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.syncLatest.mockResolvedValue(mkTask('success', { roles: [] }))
})

function mountPanel() {
  return mount(CommunitySyncPanel, {
    props: { open: true },
    global: { stubs: { teleport: true } },
  })
}

describe('CommunitySyncPanel', () => {
  it('打开时加载最近同步；无记录显示空态', async () => {
    apiMock.syncLatest.mockRejectedValue(new Error('还没有同步记录'))
    const w = mountPanel()
    await flushPromises()
    expect(w.text()).toContain('还没有同步记录')
  })

  it('有记录时渲染结果表格', async () => {
    apiMock.syncLatest.mockResolvedValue(mkTask('success', {
      roles: [{ roleName: '剑魂', job: '极诣·剑魂', jobName: 'weapon_master', level: 115,
                fame: 133227, server: '山西一区', action: 'created', reason: null,
                characterId: 1, profileImported: true }],
    }))
    const w = mountPanel()
    await flushPromises()
    expect(w.text()).toContain('剑魂')
    expect(w.text()).toContain('已创建')
    expect(w.text()).toContain('已导入')
  })

  it('提交成功→关闭弹窗+提示后台进行', async () => {
    apiMock.syncCreate.mockResolvedValue({ taskId: 1 })
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-act="community-id-input"]').setValue('329230843')
    await w.find('[data-act="sync-submit"]').trigger('click')
    await flushPromises()
    expect(apiMock.syncCreate).toHaveBeenCalledWith({ communityId: '329230843' })
    expect(notifyMock.notifySuccess).toHaveBeenCalledWith('同步工作后台进行，稍后查看结果')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('今日已同步→notifyWarning', async () => {
    apiMock.syncCreate.mockRejectedValue(new Error('今日已同步，请明天再试'))
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-act="community-id-input"]').setValue('1')
    await w.find('[data-act="sync-submit"]').trigger('click')
    await flushPromises()
    expect(notifyMock.notifyWarning).toHaveBeenCalledWith('今日已同步，请明天再试')
  })

  it('打开显示 failed 任务→统一失败文案', async () => {
    apiMock.syncLatest.mockResolvedValue(mkTask('failed'))
    const w = mountPanel()
    await flushPromises()
    expect(w.text()).toContain('查询失败，请联系管理员')
  })

  it('打开时任务进行中→自动轮询；关闭停止', async () => {
    vi.useFakeTimers()
    apiMock.syncLatest.mockResolvedValue(mkTask('running'))
    const w = mountPanel()
    await flushPromises()
    const afterOpen = apiMock.syncLatest.mock.calls.length  // 打开即加载一次
    await vi.advanceTimersByTimeAsync(5000)
    expect(apiMock.syncLatest.mock.calls.length).toBe(afterOpen + 1)  // 自动续轮询
    await w.setProps({ open: false })
    const afterClose = apiMock.syncLatest.mock.calls.length
    await vi.advanceTimersByTimeAsync(6000)
    expect(apiMock.syncLatest.mock.calls.length).toBe(afterClose)  // 关闭停止
    vi.useRealTimers()
  })
})
