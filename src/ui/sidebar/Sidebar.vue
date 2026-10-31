<template>
  <aside class="sidebar" :style="{ width: prefStore.sidebarWidth + 'px' }">
    <div
      v-if="currentSidebarTab && runtimeStore.openedSidebars.length === 1"
      class="sidebar-title single"
    >
      <div
        class="sidebar-title-single-text"
        @mousedown="(e) => e.button === 1 && runtimeStore.closeCurrentSidebar()"
      >
        {{ currentSidebarTab.title }}
      </div>
      <Button
        icon="pi pi-times"
        variant="text"
        severity="secondary"
        @click="runtimeStore.closeCurrentSidebar"
      />
    </div>
    <div v-else class="sidebar-title multiple">
      <Tabs v-model:value="runtimeStore.currentSidebarIndex">
        <TabList>
          <Tab v-for="(tab, index) in openedSidebarTabs" :key="tab.key" :value="index">
            <div
              class="p-tab-inner"
              @mousedown="(e) => e.button === 1 && runtimeStore.closeSidebar(tab.key)"
            >
              {{ tab.title }}
              <Button
                icon="pi pi-times"
                size="small"
                variant="text"
                severity="secondary"
                rounded
                @click.stop="runtimeStore.closeSidebar(tab.key)"
              />
            </div>
          </Tab>
        </TabList>
      </Tabs>
    </div>
    <KeepAlive>
      <component class="sidebar-inner" :is="currentSidebarTab?.component" />
    </KeepAlive>
    <div class="sidebar-resizer" @mousedown="handleResizeStart"></div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { usePrefStore, useRuntimeStore } from '@states/stores'

import { Button, Tab, TabList, Tabs } from 'primevue'

import { sidebarRegs } from '.'

const runtimeStore = useRuntimeStore()
const prefStore = usePrefStore()

const openedSidebarTabs = computed(() => runtimeStore.openedSidebars.map((key) => sidebarRegs[key]))
const currentSidebarTab = computed(() => openedSidebarTabs.value[runtimeStore.currentSidebarIndex])

const MIN_SIDEBAR_WIDTH = 200
function handleResizeStart(e: MouseEvent) {
  const startX = e.clientX
  const startWidth = prefStore.sidebarWidth
  function handleMouseMove(e: MouseEvent) {
    const deltaX = e.clientX - startX
    prefStore.sidebarWidth = Math.max(MIN_SIDEBAR_WIDTH, startWidth + deltaX)
  }
  function handleMouseUp() {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
}
</script>

<style lang="scss">
@keyframes sidebar-enter {
  from {
    transform: translateX(-5rem);
  }
}
@keyframes editor-shrink {
  from {
    transform: translateX(-5rem);
  }
}
@keyframes editor-expand {
  from {
    transform: translateX(5rem);
  }
}
.sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--p-content-border-color);
  position: relative;
  animation:
    sidebar-enter 0.3s var(--global-ease),
    fade 0.3s;
  margin: 0.5rem 0;
}
.editor-shell {
  animation: editor-expand 0.3s var(--global-ease);
}
.sidebar + .editor-shell {
  animation: editor-shrink 0.3s var(--global-ease);
}

.sidebar-title {
  height: 3.2rem;
  &.single {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.3rem 0.5rem 0 1rem;
  }
  &.multiple {
    --p-tabs-tab-padding: 0 0.35rem 0 0.8rem;
    --p-tabs-active-bar-height: 0px;
    --p-tabs-tablist-border-width: 0;
    --p-tabs-tablist-border-color: transparent;
    --p-tabs-tablist-background: transparent;
    --p-tabs-tab-background: transparent;
    --p-button-sm-icon-only-width: 1.4rem;
    --p-button-sm-font-size: 0.8rem;
    display: flex;
    align-items: center;
    padding: 0 0.6rem;
    .p-tabs,
    .p-tablist,
    .p-tablist-content,
    .p-tablist-tab-list {
      background: transparent;
      border: none;
      min-width: 0;
    }
    .p-tabs {
      flex: 1;
      min-width: 0;
    }
    .p-tablist-content {
      overflow-x: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }
    }
    .p-tablist-active-bar {
      display: none;
    }
    .p-tablist-tab-list {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.3rem 0;
    }
    .p-tab {
      flex-shrink: 0;
      height: 2.1rem;
      box-sizing: border-box;
      padding: 0;
      display: flex;
      align-items: center;
      // Tabs are <button>s, which don't inherit the page font by themselves. Without this the
      // labels fall back to the browser's default button font once two tabs are open.
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      white-space: nowrap;
      animation: sidebar-tab-in 0.25s var(--global-ease);
      border: 1px solid var(--p-content-border-color);
      border-radius: 10px;
      background: var(--p-content-background);
      color: var(--p-text-muted-color);
      transition:
        background 0.15s,
        border-color 0.15s,
        color 0.15s;
      &:hover {
        border-color: color-mix(in srgb, var(--p-primary-color), transparent 55%);
        color: var(--p-text-color);
      }
      &-active {
        background: color-mix(in srgb, var(--p-primary-color), transparent 88%);
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
      }
      &:nth-child(1) {
        animation: none;
      }
    }
    @keyframes sidebar-tab-in {
      from {
        opacity: 0;
        transform: translateY(1rem);
      }
    }

    .p-tab-inner {
      padding: var(--p-tabs-tab-padding);
      display: flex;
      align-items: center;
      gap: 0.3rem;
      height: 100%;
    }
  }
}
.sidebar-title-single-text {
  font-size: 1.4rem;
}
.sidebar-inner {
  height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0.8rem 0.8rem 0.3rem 1rem;
}
.sidebar-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  right: -0.15rem;
  width: 0.3rem;
  background-color: var(--p-primary-color);
  z-index: 3;
  opacity: 0;
  transition: opacity 0.1s;
  &:hover {
    opacity: 0.7;
    transition-delay: 0.3s;
  }
  &:active {
    opacity: 0.7;
    transition: opacity 0.1s;
  }
  &,
  :root:has(&:active) {
    cursor: ew-resize;
  }
}
</style>
