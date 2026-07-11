<script setup lang="ts">
import { shallowRef } from "vue";
import { ApiError, apiFetch, type TokenView } from "@/lib/client";

interface Props {
  packageId: number;
}

interface Emits {
  created: [token: string, row: TokenView];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const label = shallowRef("");
const permission = shallowRef<"read" | "write" | "readwrite">("read");
const error = shallowRef<string | undefined>(undefined);
const submitting = shallowRef(false);

async function createToken(): Promise<void> {
  submitting.value = true;
  error.value = undefined;
  try {
    const result = await apiFetch<{ token: string; row: TokenView }>(
      `/api/packages/${props.packageId}/tokens`,
      {
        method: "POST",
        body: JSON.stringify({
          label: label.value.trim(),
          canRead: permission.value !== "write",
          canWrite: permission.value !== "read",
        }),
      },
    );
    label.value = "";
    permission.value = "read";
    emit("created", result.token, result.row);
  } catch (cause) {
    error.value =
      cause instanceof ApiError ? cause.message : "Something went wrong";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="createToken">
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="label"
        type="text"
        placeholder="Label, e.g. ci-publish"
        required
        maxlength="100"
        class="w-56 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
      />
      <select
        v-model="permission"
        class="cursor-pointer rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
      >
        <option value="read">Read only (install)</option>
        <option value="write">Write only (publish)</option>
        <option value="readwrite">Read and write</option>
      </select>
      <button
        type="submit"
        :disabled="submitting"
        class="cursor-pointer rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-default disabled:opacity-50"
      >
        Generate token
      </button>
    </div>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
  </form>
</template>
