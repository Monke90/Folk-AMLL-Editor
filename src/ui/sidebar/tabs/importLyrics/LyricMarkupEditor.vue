<template>
  <div class="lyric-markup-editor">
    <div class="lm-toolbar" role="toolbar" :aria-label="tt.toolbar()">
      <Button
        icon="mdi mdi-account-voice"
        variant="text"
        severity="secondary"
        size="small"
        :disabled="!format.usePrefixes || !format.bgPrefix"
        :aria-label="tt.background()"
        :title="`${tt.background()} (Alt+B)`"
        @click="run(toggleLinePrefix('background'))"
      />
      <Button
        icon="mdi mdi-account-multiple"
        variant="text"
        severity="secondary"
        size="small"
        :disabled="!format.usePrefixes || !format.duetPrefix"
        :aria-label="tt.duet()"
        :title="`${tt.duet()} (Alt+D)`"
        @click="run(toggleLinePrefix('duet'))"
      />
      <Button
        icon="mdi mdi-scissors-cutting"
        variant="text"
        severity="secondary"
        size="small"
        :disabled="!format.wordSeparator"
        :aria-label="tt.split()"
        :title="`${tt.split()} (Alt+S)`"
        @click="run(splitOrJoin)"
      />
      <span class="lm-hint">{{ tt.hint() }}</span>
    </div>
    <div class="lm-editor r-codemirror-shell" ref="hostEl"></div>
  </div>
</template>

<script setup lang="ts">
import { isolateHistory } from '@codemirror/commands'
import { Compartment, EditorState, Transaction } from '@codemirror/state'
import { EditorView, placeholder as placeholderText } from '@codemirror/view'
import { t } from '@i18n'
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'

import type { ImportTextFormat } from '@core/lyricsImport/types'

import {
  type LyricMarkupLabels,
  formatFacet,
  labelsFacet,
  lyricMarkupExtensions,
  splitOrJoin,
  toggleLinePrefix,
} from './markupExtensions'
import { Button } from 'primevue'

const tt = t.importLyrics.markup

/**
 * A plain text lyric editor that draws its markup as it goes: background and duet lines styled
 * by role, syllable splits as dots, and translation rows labelled. The line the cursor is on
 * shows its raw symbols. The value is always the plain text.
 */
const [value] = defineModel<string>({ required: true })
const props = defineProps<{
  format: ImportTextFormat
  ariaLabel: string
  placeholder?: string
}>()

const hostEl = useTemplateRef('hostEl')
const view = shallowRef<EditorView | null>(null)
const formatCompartment = new Compartment()
const labelsCompartment = new Compartment()
const attributesCompartment = new Compartment()

const labels = computed<LyricMarkupLabels>(() => ({
  joinSyllables: tt.joinSyllables(),
  background: tt.gutter.background(),
  duet: tt.gutter.duet(),
  translation: tt.gutter.translation(),
  romanization: tt.gutter.romanization(),
  removed: tt.gutter.removed(),
  dropped: tt.gutter.dropped(),
  missingTranslation: tt.gutter.missingTranslation(),
  missingRomanization: tt.gutter.missingRomanization(),
}))
const attributes = computed(() => [
  EditorView.contentAttributes.of({
    'aria-label': props.ariaLabel,
    'aria-multiline': 'true',
    spellcheck: 'false',
  }),
  ...(props.placeholder ? [placeholderText(props.placeholder)] : []),
])

// The text the editor holds, so a change coming from the editor is not applied back to it
let knownValue = value.value

onMounted(() => {
  if (!hostEl.value) return
  view.value = new EditorView({
    parent: hostEl.value,
    state: EditorState.create({
      doc: value.value,
      extensions: [
        formatCompartment.of(formatFacet.of({ ...props.format })),
        labelsCompartment.of(labelsFacet.of(labels.value)),
        attributesCompartment.of(attributes.value),
        lyricMarkupExtensions,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          const text = update.state.doc.toString()
          knownValue = text
          value.value = text
        }),
      ],
    }),
  })
})
onUnmounted(() => {
  view.value?.destroy()
  view.value = null
})

watch(
  () => ({ ...props.format }),
  (format) =>
    view.value?.dispatch({ effects: formatCompartment.reconfigure(formatFacet.of(format)) }),
)
watch(labels, (next) =>
  view.value?.dispatch({ effects: labelsCompartment.reconfigure(labelsFacet.of(next)) }),
)
watch(attributes, (next) =>
  view.value?.dispatch({ effects: attributesCompartment.reconfigure(next) }),
)

// A tool or a fetched song replaced the text: one undo step of its own
watch(value, (next) => {
  const editor = view.value
  if (!editor || next === knownValue) return
  knownValue = next
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: next },
    annotations: [Transaction.addToHistory.of(true), isolateHistory.of('full')],
  })
})

function run(command: (view: EditorView) => boolean) {
  const editor = view.value
  if (!editor) return
  command(editor)
  editor.focus()
}
</script>

<style lang="scss">
.lyric-markup-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  .lm-toolbar {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    padding-bottom: 0.3rem;
    --p-button-sm-icon-only-width: 2rem;
    .lm-hint {
      min-width: 0;
      margin-left: 0.4rem;
      font-size: 0.8rem;
      opacity: 0.65;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .lm-editor {
    flex: 1;
    min-height: 0;
    display: flex;
    &:focus-within {
      border-color: var(--p-primary-color);
    }
    .cm-editor {
      flex: 1;
      min-width: 0;
    }
    .cm-scroller {
      font-family: inherit;
      font-size: 0.95rem;
      line-height: 1.6;
    }
    .cm-content {
      padding: 0.5rem 0 3rem;
    }
    .cm-line {
      padding: 0 0.8rem 0 0.6rem;
    }
    .cm-placeholder {
      opacity: 0.6;
    }
  }

  /* Margin notes: what each line becomes */
  .lm-gutter {
    width: 6.2rem;
  }
  .lm-mark {
    display: block;
    overflow: hidden;
    padding: 0 0.5rem;
    font-size: 0.75rem;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
    &[data-kind='removedHeader'] {
      text-decoration: line-through;
    }
    &[data-kind='warning'] {
      color: var(--p-orange-500);
      font-weight: 500;
    }
  }

  /* Line roles. Wrapped rows keep the line's indent, so they stay attached. */
  .cm-line.lm-background {
    padding-left: 1.8rem;
    font-size: 0.9em;
    opacity: 0.75;
  }
  .cm-line.lm-duet {
    text-align: right;
  }
  .cm-line.lm-sub {
    padding-left: 1.4rem;
    font-size: 0.9em;
    opacity: 0.7;
  }
  .cm-line.lm-removed {
    text-decoration: line-through;
    opacity: 0.55;
  }
  .cm-line.lm-warning {
    background-color: color-mix(in srgb, var(--p-orange-500), transparent 85%);
  }

  /* Syllable split shown as a dot; click it to join the syllables */
  .lm-dot {
    display: inline;
    margin: 0 1px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--p-primary-color);
    font: inherit;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    &:hover {
      color: var(--p-text-color);
    }
  }

  /* Replaces the same-line separator with the name of what follows */
  .lm-subLabel {
    margin: 0 0.4rem;
    padding: 0 0.25rem;
    border-radius: 0.25rem;
    background-color: color-mix(in srgb, currentColor, transparent 88%);
    font-size: 0.75rem;
    opacity: 0.8;
  }
}
</style>
