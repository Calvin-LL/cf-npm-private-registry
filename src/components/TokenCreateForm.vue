<script setup lang="ts">
import { ref, shallowRef } from "vue";
import {
  ApiError,
  apiFetch,
  type PackageOption,
  type TokenView,
} from "@/lib/client";

interface Props {
  packages: PackageOption[];
  defaultSelectedIds?: number[];
}

interface Emits {
  created: [token: string, row: TokenView];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const label = shallowRef("");
const permission = shallowRef<"read" | "write" | "readwrite">("read");
const selectedIds = ref<number[]>([...(props.defaultSelectedIds ?? [])]);
const error = shallowRef<string | undefined>(undefined);
const submitting = shallowRef(false);

async function createToken(): Promise<void> {
  if (selectedIds.value.length === 0) {
    error.value = "Select at least one package for this token";
    return;
  }
  submitting.value = true;
  error.value = undefined;
  try {
    const result = await apiFetch<{ token: string; row: TokenView }>(
      "/api/tokens",
      {
        method: "POST",
        body: JSON.stringify({
          label: label.value.trim(),
          canRead: permission.value !== "write",
          canWrite: permission.value !== "read",
          packageIds: selectedIds.value,
        }),
      },
    );
    label.value = "";
    permission.value = "read";
    selectedIds.value = [...(props.defaultSelectedIds ?? [])];
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
  <form class="flex flex-col gap-3" @submit.prevent="createToken">
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="label"
        type="text"
        placeholder="Label, e.g. ci-publish"
        required
        maxlength="100"
        class="border-line-strong bg-surface focus:border-line-focus w-56 rounded-md border px-3 py-1.5 text-sm focus:outline-none"
      />
      <select
        v-model="permission"
        class="border-line-strong bg-surface focus:border-line-focus cursor-pointer rounded-md border px-2 py-1.5 text-sm focus:outline-none"
      >
        <option value="read">Read only (install)</option>
        <option value="write">Write only (publish)</option>
        <option value="readwrite">Read and write</option>
      </select>
      <button
        type="submit"
        :disabled="submitting"
        class="bg-primary text-primary-ink hover:bg-primary-hover cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-50"
      >
        Generate token
      </button>
    </div>
    <fieldset class="flex flex-col gap-1.5">
      <legend class="text-ink-muted mb-1.5 text-xs font-medium uppercase">
        Grants access to
      </legend>
      <label
        v-for="pkg in packages"
        :key="pkg.id"
        class="flex cursor-pointer items-center gap-2 text-sm"
      >
        <input
          v-model="selectedIds"
          type="checkbox"
          :value="pkg.id"
          class="cursor-pointer"
        />
        <span class="font-mono">{{ pkg.name }}</span>
      </label>
    </fieldset>
    <p v-if="error" class="text-danger text-sm">{{ error }}</p>
  </form>
</template>
