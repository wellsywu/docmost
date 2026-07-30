<script setup lang="ts">
import { docmostIntegration } from '@/services/docmost'

const { t } = useI18n()
</script>

<template>
  <div
    v-if="docmostIntegration.mode.value && docmostIntegration.status.value === 'error'"
    class="fixed left-1/2 top-4 z-300 w-[min(92vw,42rem)] -translate-x-1/2 rounded-lg border border-destructive/40 bg-background p-4 shadow-lg"
    role="alert"
  >
    <p class="font-medium text-destructive">
      {{ t('docmost.bootstrapFailed') }}
    </p>
    <p class="mt-1 text-sm text-muted-foreground">
      {{ docmostIntegration.error.value }}
    </p>
    <p class="mt-2 text-sm">
      {{ t('docmost.reopenFromDocmost') }}
    </p>
  </div>
</template>
