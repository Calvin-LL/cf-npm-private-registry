<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { ApiError, apiFetch } from "@/lib/client";

const name = shallowRef("");
const ecosystem = shallowRef<"npm" | "cargo">("npm");
const error = shallowRef<string | undefined>(undefined);
const submitting = shallowRef(false);
const placeholder = computed(function packagePlaceholder() {
  return ecosystem.value === "npm" ? "@myscope/my-package" : "my-crate";
});

async function createPackage(): Promise<void> {
  const trimmed = name.value.trim();
  const valid =
    ecosystem.value === "npm"
      ? /^@[a-z0-9~-][a-z0-9._~-]*\/[a-z0-9~-][a-z0-9._~-]*$/.test(trimmed)
      : /^[a-z][a-z0-9_-]{0,63}$/.test(trimmed);
  if (!valid) {
    error.value =
      ecosystem.value === "npm"
        ? "Use a scoped lowercase name, like @myscope/my-package"
        : "Use a lowercase Cargo crate name, like my-crate";
    return;
  }
  submitting.value = true;
  error.value = undefined;
  try {
    await apiFetch("/api/packages", {
      method: "POST",
      body: JSON.stringify({ name: trimmed, ecosystem: ecosystem.value }),
    });
    window.location.href = `/packages/${trimmed}`;
  } catch (cause) {
    error.value =
      cause instanceof ApiError ? cause.message : "Something went wrong";
    submitting.value = false;
  }
}
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="createPackage">
    <div class="flex flex-wrap gap-2">
      <select
        v-model="ecosystem"
        aria-label="Package ecosystem"
        class="border-line-strong bg-surface focus:border-line-focus cursor-pointer rounded-md border px-3 py-1.5 text-sm focus:outline-none"
      >
        <option value="npm">npm</option>
        <option value="cargo">Cargo</option>
      </select>
      <input
        v-model="name"
        type="text"
        :placeholder="placeholder"
        required
        class="border-line-strong bg-surface focus:border-line-focus w-72 rounded-md border px-3 py-1.5 font-mono text-sm placeholder:font-sans focus:outline-none"
      />
      <button
        type="submit"
        :disabled="submitting"
        class="bg-primary text-primary-ink hover:bg-primary-hover cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-50"
      >
        Create package
      </button>
    </div>
    <p v-if="error" class="text-danger text-sm">{{ error }}</p>
  </form>
</template>
