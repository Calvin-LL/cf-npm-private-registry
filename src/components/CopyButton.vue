<script setup lang="ts">
import { shallowRef } from "vue";

interface Props {
  text: string;
}

const props = defineProps<Props>();
const copied = shallowRef(false);

async function copy(): Promise<void> {
  await navigator.clipboard.writeText(props.text);
  copied.value = true;
  setTimeout(function resetCopied() {
    copied.value = false;
  }, 1500);
}
</script>

<template>
  <button
    type="button"
    class="border-line-strong bg-surface text-ink-muted hover:bg-chip hover:text-ink cursor-pointer rounded-md border px-2 py-1 text-xs font-medium transition-colors"
    @click="copy"
  >
    {{ copied ? "Copied!" : "Copy" }}
  </button>
</template>
