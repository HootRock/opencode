/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { createSignal, onMount } from "solid-js"
import { DialogUpdate } from "../../src/component/dialog-update"
import { ConfigProvider } from "../../src/config"
import type { UpdateState } from "../../src/context/update-notification"
import { Keymap } from "../../src/context/keymap"
import { ThemeProvider } from "../../src/context/theme"
import { DialogProvider, useDialog } from "../../src/ui/dialog"
import { ToastProvider } from "../../src/ui/toast"
import { emptyThemeSource, tmpdir } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

test("installation progress replaces checking while the update job is still pending", async () => {
  await using temporary = await tmpdir()
  const [state, setState] = createSignal<UpdateState>()
  const pending = Promise.withResolvers<string | undefined>()
  const app = await testRender(
    () => (
      <TestTuiContexts directory={temporary.path} paths={{ state: temporary.path }}>
        <ConfigProvider config={createTuiResolvedConfig()}>
          <ThemeProvider mode="dark" source={emptyThemeSource}>
            <Keymap.Provider>
              <ToastProvider>
                <DialogProvider>
                  <DialogUpdate
                    check={() => pending.promise}
                    state={state}
                    skip={() => {}}
                    install={() => Promise.resolve()}
                    restart={() => {}}
                  />
                </DialogProvider>
              </ToastProvider>
            </Keymap.Provider>
          </ThemeProvider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width: 80, height: 24, kittyKeyboard: true },
  )

  try {
    app.renderer.start()
    await app.waitForFrame((frame) => frame.includes("Checking for updates"))
    setState({ type: "installing", version: "2.0.0" })
    await app.waitForFrame(
      (frame) =>
        frame.includes("Updating OpenCode") &&
        frame.includes("Installing OpenCode 2.0.0") &&
        !frame.includes("Checking"),
    )
    expect(app.captureCharFrame()).not.toContain("Skip")
    pending.reject(new Error("Update service unavailable"))
    await app.waitForFrame((frame) => frame.includes("Update service unavailable") && !frame.includes("Installing"))
  } finally {
    pending.resolve(undefined)
    app.renderer.destroy()
  }
})

for (const designs of [false, true]) {
  test.each([44, 100])(
    `installed update explains manual reopening (new designs: ${designs}, width: %i)`,
    async (width) => {
      await using temporary = await tmpdir()
      const [exits, setExits] = createSignal(0)
      const [state, setState] = createSignal<UpdateState>({ type: "available", version: "2.0.31" })
      function Open() {
        const dialog = useDialog()
        onMount(() =>
          dialog.replace(() => (
            <DialogUpdate
              state={state}
              skip={() => {}}
              install={async () => {
                setState({ type: "installed", version: "2.0.31" })
              }}
              restart={() => setExits((count) => count + 1)}
            />
          )),
        )
        return null
      }
      const app = await testRender(
        () => (
          <TestTuiContexts directory={temporary.path} paths={{ state: temporary.path }}>
            <ConfigProvider config={createTuiResolvedConfig({ experimental: { "new-designs": designs } })}>
              <ThemeProvider mode="dark" source={emptyThemeSource}>
                <Keymap.Provider>
                  <ToastProvider>
                    <DialogProvider>
                      <Open />
                    </DialogProvider>
                  </ToastProvider>
                </Keymap.Provider>
              </ThemeProvider>
            </ConfigProvider>
          </TestTuiContexts>
        ),
        { width, height: 24, kittyKeyboard: true },
      )

      try {
        app.renderer.start()
        await app.waitForFrame((frame) => frame.includes("An update is available."))
        expect(app.captureCharFrame().replace(/\s+/g, " ")).toContain("quit and run opencode again")
        app.mockInput.pressEnter()
        await app.waitForFrame((frame) => frame.includes("Update successful!"))
        const frame = app.captureCharFrame().replace(/\s+/g, " ")
        expect(frame).toContain("run opencode again")
        expect(frame).toContain(designs ? "skip quit enter" : "Skip Quit")
        expect(frame).not.toContain("Restart")
        expect(frame).not.toContain("resumed automatically")
        expect(exits()).toBe(0)
        app.mockInput.pressEnter()
        await app.waitFor(() => exits() === 1)
        expect(exits()).toBe(1)
      } finally {
        app.renderer.destroy()
      }
    },
  )
}
