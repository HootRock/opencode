import { expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

const calls: string[] = []
let delivered = true
let failure: string | undefined
const message = { id: "msg_sent", type: "user", text: "original prompt", files: [] }
const composer = {
  current: () => [],
  cursor: () => 0,
  set: () => calls.push("draft.restore"),
  context: { items: () => [], replace: () => {} },
}
const api = {
  session: {
    inbox: {
      cancel: async () => {
        calls.push("cancel")
      },
    },
    message: {
      get: async () => {
        calls.push("message.get")
        if (failure === "message.get") throw new Error("offline")
        if (!delivered) throw { _tag: "MessageNotFoundError" }
        return message
      },
    },
    interrupt: async () => {
      calls.push("interrupt")
      if (failure === "interrupt") throw new Error("interrupt failed")
    },
    revert: {
      stage: async () => {
        calls.push("stage")
        if (failure === "stage") throw new Error("stage failed")
      },
    },
  },
  experimental: {
    session: {
      wait: async () => {
        calls.push("wait")
        if (failure === "wait") throw new Error("wait failed")
      },
    },
  },
}
const data = {
  on: () => () => {},
  session: {
    get: () => ({}),
    message: { list: () => [message] },
    input: { has: () => true },
  },
}
mock.module("@opencode/ui/toast", () => ({ toaster: { dismiss: () => {} } }))
mock.module("@/composer/persistence", () => ({ useComposerState: () => ({ capture: () => composer }) }))
mock.module("@/runtime/server/current", () => ({ useData: () => data }))
mock.module("@/runtime/server/client", () => ({ useServerSDK: () => ({ api }) }))
mock.module("@/workspaces/location", () => ({ useWorkspaceLocation: () => () => ({ directory: "E:/fixture" }) }))
mock.module("@/runtime/i18n/language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }))
mock.module("@/composer/prompt", () => ({
  extractPromptContext: () => ({ comments: [], files: [] }),
  extractPromptFromMessage: () => [{ type: "text", content: "original prompt" }],
}))
mock.module("@/composer/media", () => ({ pinPromptMedia: async (prompt: unknown) => prompt }))
mock.module("@/composer/prompt-parts", () => ({ clonePrompt: (prompt: unknown) => prompt, promptLength: () => 15 }))
mock.module("@/shell/notifications/toast", () => ({ showToast: () => "toast" }))

const { createSessionRevert } = await import("../src/session/revert")

test("undo does not restore an already delivered prompt after a no-op cancel without staging its rewind", async () => {
  calls.length = 0
  delivered = true
  failure = undefined
  let dispose = () => {}
  const revert = createRoot((cleanup) => {
    dispose = cleanup
    return createSessionRevert({
      session: {
        identity: { params: { id: "ses_fixture" } },
        history: { userMessages: () => [message] },
        data: { revertMessageID: () => undefined },
      } as Parameters<typeof createSessionRevert>[0]["session"],
      setActiveMessage: () => {},
    })
  })
  try {
    await revert.undo()
    // The local input snapshot is stale. HTTP cancellation returned 204, but
    // message.get still sees the delivered prompt: restoration must follow a staged rewind.
    expect(calls).toEqual(["cancel", "message.get", "interrupt", "wait", "stage", "draft.restore"])
    expect(calls.indexOf("stage")).toBeLessThan(calls.indexOf("draft.restore"))
  } finally {
    dispose()
  }
})

test("a genuinely pending prompt can be cancelled and restored without staging", async () => {
  calls.length = 0
  delivered = false
  failure = undefined
  let dispose = () => {}
  const revert = createRoot((cleanup) => {
    dispose = cleanup
    return createSessionRevert({
      session: {
        identity: { params: { id: "ses_fixture" } },
        history: { userMessages: () => [message] },
        data: { revertMessageID: () => undefined },
      } as Parameters<typeof createSessionRevert>[0]["session"],
      setActiveMessage: () => {},
    })
  })
  try {
    await revert.undo()
    expect(calls).toContain("cancel")
    expect(calls).toContain("draft.restore")
    expect(calls).not.toContain("stage")
  } finally {
    dispose()
  }
})

for (const step of ["message.get", "interrupt", "wait", "stage"]) {
  test(`a failed ${step} leaves the draft alone`, async () => {
    calls.length = 0
    delivered = true
    failure = step
    let dispose = () => {}
    const revert = createRoot((cleanup) => {
      dispose = cleanup
      return createSessionRevert({
        session: {
          identity: { params: { id: "ses_fixture" } },
          history: { userMessages: () => [message] },
          data: { revertMessageID: () => undefined },
        } as Parameters<typeof createSessionRevert>[0]["session"],
        setActiveMessage: () => {},
      })
    })
    try {
      await revert.undo()
      expect(calls).toContain(step)
      expect(calls).not.toContain("draft.restore")
      expect(revert.canUndo()).toBe(true)
    } finally {
      dispose()
    }
  })
}
