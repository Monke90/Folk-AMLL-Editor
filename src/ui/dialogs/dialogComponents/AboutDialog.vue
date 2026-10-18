<template>
  <Dialog v-model:visible="visible" :header="tt.header()" class="about-dialog">
    <div class="heading">
      <img .src="'/favicons/brand.svg'" class="logo" draggable="false" />
      <div class="logo-text">
        <div class="title">{{ appName }}</div>
        <div class="title-version">
          {{ tt.version() }} {{ appVersion
          }}<template v-if="isBeta">-beta-{{ appCommitHash.substring(0, 7) }}</template>
        </div>
      </div>
    </div>
    <Divider />
    <div class="description">
      <p>
        <template v-for="(part, index) in descriptionParts" :key="index">
          <a
            v-if="part.href"
            class="about-link"
            :href="part.href"
            target="_blank"
            rel="noopener noreferrer"
            >{{ part.text }}</a
          >
          <template v-else>{{ part.text }}</template>
        </template>
      </p>
    </div>
    <div class="actions">
      <Button
        severity="secondary"
        icon="pi pi-github"
        :label="tt.githubBtn()"
        @click="handleOpenGithub()"
      />
      <Button
        :severity="keyValueFolded ? 'secondary' : 'primary'"
        icon="mdi mdi-information-outline"
        :label="tt.detailBtn()"
        @click="keyValueFolded = !keyValueFolded"
      />
    </div>
    <AnimatedFold :folded="keyValueFolded">
      <Divider />
      <div class="key-value">
        <template v-for="([key, val], index) in detail" :key="index">
          <span class="key">{{ key }}</span>
          <span class="value">{{ val }}</span>
        </template>
      </div>
    </AnimatedFold>
  </Dialog>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { ref } from 'vue'

import AnimatedFold from '@ui/components/AnimatedFold.vue'
import { Button, Dialog, Divider } from 'primevue'

const tt = t.about
const [visible] = defineModel<boolean>({ required: true })

const keyValueFolded = ref(true)

const UPSTREAM_URL = 'https://github.com/amll-dev/amll-editor'
const AUTHOR_URL = 'https://yoursit.ee/folk'
const descriptionLinks: Record<string, { text: string; href: string }> = {
  '%upstream%': { text: 'amll-editor', href: UPSTREAM_URL },
  '%author%': { text: 'InternalMonke', href: AUTHOR_URL },
}
// The translated sentence marks where the two links go with %upstream% and %author%
const descriptionParts = tt
  .description()
  .split(/(%upstream%|%author%)/)
  .filter((text) => text !== '')
  .map((text) => descriptionLinks[text] ?? { text, href: undefined })

const appName = __APP_DISPLAY_NAME__
const appVersion = __APP_VERSION__
const appCommitHash = __APP_COMMIT_HASH__
const isBeta = __APP_IS_BETA__
const readableBuildDate = new Date(__APP_BUILD_TIMESTAMP__).toLocaleString()

function handleOpenGithub() {
  window.open(__REPO_URL__, '_blank')
}

const detail: [string, string][] = [
  [tt.detail.version(), __APP_VERSION__],
  [tt.detail.channel(), __APP_BUILD_CHANNEL__ ?? tt.detail.notSpecified()],
  [tt.detail.hash(), __APP_COMMIT_HASH__],
  [tt.detail.buildTime(), readableBuildDate],
  [tt.detail.amllCoreVersion(), __AMLL_CORE_VERSION__],
  [tt.detail.amllVueVersion(), __AMLL_VUE_VERSION__],
]
</script>

<style lang="scss">
.about-dialog {
  width: 32rem;

  .heading {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .logo {
    width: 4rem;
    height: 4rem;
  }
  .logo-text {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    line-height: 1;
  }
  .title-version {
    opacity: 0.7;
  }
  .title {
    font-size: 2rem;
  }
  .description {
    margin: 0.75rem 0;
    line-height: 1.5;
    opacity: 0.9;
    p {
      margin: 0.5rem 0;
    }
  }
  .about-link {
    color: var(--p-primary-color);
    text-decoration: none;
    border-radius: 0.2rem;
    padding: 0 0.1rem;
    transition: background-color 0.15s;
    &:hover,
    &:focus-visible {
      background-color: color-mix(in srgb, var(--p-primary-color) 22%, transparent);
      text-decoration: underline;
    }
  }
  .actions {
    display: flex;
    gap: 1rem;
  }
  .key-value {
    display: grid;
    grid-template-columns: auto 1fr;
    row-gap: 0.5rem;
    column-gap: 1rem;
    margin-top: 1rem;
    user-select: text;
  }
  .key {
    font-weight: bold;
    opacity: 0.6;
  }
  .value {
    word-break: break-all;
    font-family: var(--font-monospace);
  }
}
</style>
