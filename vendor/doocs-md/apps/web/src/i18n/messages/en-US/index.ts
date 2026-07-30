import ai from './ai'
import chrome from './chrome'
import common from './common'
import dialog from './dialog'
import docmost from './docmost'
import editor from './editor'
import marketplace from './marketplace'
import notifications from './notifications'
import store from './store'
import upload from './upload'

export default {
  ...common,
  ...chrome,
  ...dialog,
  ...docmost,
  ...editor,
  ...marketplace,
  ...notifications,
  ...ai,
  ...upload,
  ...store,
}
