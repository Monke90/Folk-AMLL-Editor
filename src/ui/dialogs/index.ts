import type { Component } from 'vue'

import type { ValueOf } from '@utils/types'

import AboutDialog from './dialogComponents/AboutDialog.vue'
import BatchTimeShiftDialog from './dialogComponents/BatchTimeShiftDialog.vue'
import CommentDialog from './dialogComponents/CommentDialog.vue'
import CompatibilityDialog from './dialogComponents/CompatibilityDialog.vue'
import FetchSongwritersDialog from './dialogComponents/FetchSongwritersDialog.vue'
import FindReplaceDialog from './dialogComponents/FindReplaceDialog.vue'
import FromOtherFormatModal from './dialogComponents/FromOtherFormatModal.vue'
import FromTextModal from './dialogComponents/FromTextModal.vue'
import KeyBindingDialog from './dialogComponents/KeyBindingDialog.vue'

export const DialogKey = {
  BatchTimeShift: 'batchTimeShift',
  FindReplace: 'findReplace',
  KeyBinding: 'keyBinding',
  About: 'about',
  FromOtherFormat: 'fromOtherFormat',
  FromText: 'fromText',
  FetchSongwriters: 'fetchSongwriters',
  Compatibility: 'compatibility',
  Comment: 'comment',
} as const
export type DialogKey = ValueOf<typeof DialogKey>

interface DialogReg {
  key: DialogKey
  component: Component
}

export const dialogRegs: DialogReg[] = [
  { key: DialogKey.BatchTimeShift, component: BatchTimeShiftDialog },
  { key: DialogKey.FindReplace, component: FindReplaceDialog },
  { key: DialogKey.KeyBinding, component: KeyBindingDialog },
  { key: DialogKey.About, component: AboutDialog },
  { key: DialogKey.FromOtherFormat, component: FromOtherFormatModal },
  { key: DialogKey.FromText, component: FromTextModal },
  { key: DialogKey.FetchSongwriters, component: FetchSongwritersDialog },
  { key: DialogKey.Compatibility, component: CompatibilityDialog },
  { key: DialogKey.Comment, component: CommentDialog },
]
