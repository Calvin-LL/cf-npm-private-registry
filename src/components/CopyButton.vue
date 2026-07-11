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
    class="cursor-pointer rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
    @click="copy"
  >
    {{ copied ? "Copied!" : "Copy" }}
  </button>
</template>
