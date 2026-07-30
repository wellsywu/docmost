import { uuidv4 } from '@md/shared/utils/uuid'
import { t } from '@/i18n/translate'
import { store } from '@/storage'
import { addPrefix } from '@/storage/prefix'

export interface MpAccount {
  /** UUID — internal store identifier */
  id: string
  /** WeChat public account base64 ID, e.g. "MzIxNjA5ODQ0OQ==" */
  mpId: string
  name: string
  logo: string
  desc: string
  /**
   * 1: subscription account
   * 2: service account
   */
  serviceType: `1` | `2`
  /**
   * 0: unverified
   * 1: personal verification
   * 2: enterprise verification
   */
  verify: `0` | `1` | `2`
}

export interface RemoteMpAccount {
  id: string
  name: string
  mpId?: string | null
  serviceType?: string | null
  verify?: boolean | `0` | `1` | `2`
}

export const useMpAccountsStore = defineStore(`mpAccounts`, () => {
  const accounts = store.reactive<MpAccount[]>(addPrefix(`mp-accounts`), [])
  const currentAccountId = store.reactive<string>(addPrefix(`mp-current-account-id`), ``)

  const currentAccount = computed<MpAccount | null>(() => {
    return (
      accounts.value.find(a => a.id === currentAccountId.value)
      ?? accounts.value[0]
      ?? null
    )
  })

  function addAccount(data?: Partial<Omit<MpAccount, 'id'>>): MpAccount {
    const newAccount: MpAccount = {
      id: uuidv4(),
      mpId: data?.mpId ?? ``,
      name: data?.name ?? t('store.mpAccount.newAccount'),
      logo: data?.logo ?? ``,
      desc: data?.desc ?? ``,
      serviceType: data?.serviceType ?? `1`,
      verify: data?.verify ?? `0`,
    }
    accounts.value.push(newAccount)
    currentAccountId.value = newAccount.id
    return newAccount
  }

  function updateAccount(id: string, data: Partial<Omit<MpAccount, 'id'>>) {
    const index = accounts.value.findIndex(a => a.id === id)
    if (index !== -1)
      accounts.value[index] = { ...accounts.value[index], ...data }
  }

  function deleteAccount(id: string) {
    const index = accounts.value.findIndex(a => a.id === id)
    if (index === -1)
      return
    accounts.value.splice(index, 1)
    if (currentAccountId.value === id)
      currentAccountId.value = accounts.value[0]?.id ?? ``
  }

  function setCurrentAccount(id: string) {
    currentAccountId.value = id
  }

  function replaceAccounts(remoteAccounts: readonly RemoteMpAccount[]) {
    accounts.value = remoteAccounts.map(account => ({
      id: account.id,
      mpId: account.mpId ?? ``,
      name: account.name,
      logo: ``,
      desc: ``,
      serviceType: account.serviceType === `2` || account.serviceType === `service`
        ? `2`
        : `1`,
      verify: account.verify === true
        ? `2`
        : account.verify === `1` || account.verify === `2`
          ? account.verify
          : `0`,
    }))

    if (!accounts.value.some(account => account.id === currentAccountId.value))
      currentAccountId.value = accounts.value[0]?.id ?? ``

    void store.setJSON(addPrefix(`mp-accounts`), accounts.value)
    void store.set(addPrefix(`mp-current-account-id`), currentAccountId.value)
  }

  return {
    accounts,
    currentAccountId,
    currentAccount,
    addAccount,
    updateAccount,
    deleteAccount,
    setCurrentAccount,
    replaceAccounts,
  }
})
