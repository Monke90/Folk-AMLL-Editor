<template>
  <Dialog
    class="thin-padding comment-dialog"
    v-model:visible="visible"
    modal
    :header="tt.dialogHeader()"
  >
    <div class="comment-content" v-focustrap>
      <div class="comment-target">{{ targetLabel }}</div>
      <InputText
        v-model="draft"
        fluid
        autofocus
        :placeholder="tt.commentPlaceholder()"
        @keydown.enter.prevent="save"
      />
      <div class="comment-actions">
        <Button
          :label="tt.commentRemove()"
          icon="mdi mdi-delete-outline"
          severity="secondary"
          variant="text"
          :disabled="!hasExisting"
          @click="remove"
        />
        <Button :label="tt.commentSave()" icon="mdi mdi-check" @click="save" />
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { t } from '@i18n'
import { computed, ref, watch } from 'vue'

import { normalizeComment, sharedComment } from '@core/comments'

import { useRuntimeStore } from '@states/stores'

import { Button, Dialog, InputText } from 'primevue'

const tt = t.ribbon.mark

const [visible] = defineModel<boolean>({ required: true })
const runtimeStore = useRuntimeStore()

// Syllables win over lines, like the bookmark button
const targets = computed(() =>
  runtimeStore.selectedSyllables.size > 0
    ? [...runtimeStore.selectedSyllables]
    : [...runtimeStore.selectedLines],
)
const onSyllables = computed(() => runtimeStore.selectedSyllables.size > 0)
const targetLabel = computed(() =>
  onSyllables.value ? tt.commentOnSyllables() : tt.commentOnLines(),
)

const draft = ref('')
const hasExisting = computed(() => targets.value.some((item) => item.comment))
watch(visible, (shown) => {
  if (shown) draft.value = sharedComment(targets.value)
})

function save() {
  const text = normalizeComment(draft.value)
  for (const item of targets.value) item.comment = text
  visible.value = false
}
function remove() {
  for (const item of targets.value) item.comment = ''
  visible.value = false
}
</script>

<style lang="scss">
.comment-dialog {
  width: min(28rem, 92vw);
  .comment-content {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  .comment-target {
    font-size: 0.85rem;
    color: var(--p-text-muted-color);
  }
  .comment-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
}
</style>
