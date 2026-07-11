<script setup lang="ts">
import { shallowRef } from "vue";
import { ApiError, apiFetch } from "@/lib/client";

interface Props {
  packageId: number;
  packageName: string;
}

const props = defineProps<Props>();

const error = shallowRef<string | undefined>(undefined);
const deleting = shallowRef(false);

async function deletePackage(): Promise<void> {
  const confirmed = window.confirm(
    `Delete ${props.packageName}? All versions, tarballs, and tokens will be permanently removed.`,
  );
  if (!confirmed) return;
  deleting.value = true;
  error.value = undefined;
  try {
    await apiFetch(`/api/packages/${props.packageId}`, { method: "DELETE" });
    window.location.href = "/";
  } catch (cause) {
    error.value =
      cause instanceof ApiError ? cause.message : "Something went wrong";
    deleting.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      type="button"
      :disabled="deleting"
      class="cursor-pointer self-start rounded-md border border-red-300 bg-white px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-default disabled:opacity-50"
      @click="deletePackage"
    >
      Delete package
    </button>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
  </div>
</template>
