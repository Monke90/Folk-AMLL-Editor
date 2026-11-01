<template>
  <span
    :ref="(el) => setNode(rootKey, el as ElementRef)"
    :class="[
      token.letters ? 'sp-letterGroup' : 'sp-word',
      wordBoundary && 'sp-wordBoundary',
      partOfWord && 'sp-partOfWord',
      token.allowInternalWrap && 'sp-breakableToken',
    ]"
    :dir="isRtl(token.text) ? 'rtl' : undefined"
  >
    <template v-if="token.letters">
      <span
        v-for="(letter, index) in token.letters"
        :key="letterKey(index)"
        :ref="(el) => setNode(letterKey(index), el as ElementRef)"
        class="sp-letter"
        :class="{ 'sp-spaceLetter': letter.trim().length === 0 }"
        >{{ letter }}</span
      >
    </template>
    <template v-else>{{ token.text }}</template>
  </span>
</template>

<script setup lang="ts">
import { type SpicyLine, type SpicyToken, isRtl, keyFor } from '@core/spicy/model'

type ElementRef = Element | { $el?: unknown } | null

const props = defineProps<{
  line: SpicyLine
  token: SpicyToken
  wordIndex: number
  wordBoundary?: boolean
  partOfWord?: boolean
  setNode: (key: string, el: ElementRef) => void
}>()

const rootKey = keyFor(props.line, props.token, props.wordIndex)
// Must match the keys the animator derives for each held letter
const letterKey = (index: number) =>
  `${rootKey}:${props.token.startTime + index * ((props.token.endTime - props.token.startTime) / (props.token.letters?.length ?? 1))}`
</script>
