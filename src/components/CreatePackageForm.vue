<script setup lang="ts">
import { shallowRef } from "vue";
import { ApiError, apiFetch } from "@/lib/client";

const name = shallowRef("");
const error = shallowRef<string | undefined>(undefined);
const submitting = shallowRef(false);

async function createPackage(): Promise<void> {
  const trimmed = name.value.trim();
  if (!/^@[a-z0-9~-][a-z0-9._~-]*\/[a-z0-9~-][a-z0-9._~-]*$/.test(trimmed)) {
    error.value = "Use a scoped lowercase name, like @myscope/my-package";
    return;
  }
  submitting.value = true;
  error.value = undefined;
  try {
    await apiFetch("/api/packages", {
      method: "POST",
      body: JSON.stringify({ name: trimmed }),
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
    <div class="flex gap-2">
      <input
        v-model="name"
        type="text"
        placeholder="@myscope/my-package"
        required
        class="w-72 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm placeholder:font-sans focus:border-zinc-500 focus:outline-none"
      />
      <button
        type="submit"
        :disabled="submitting"
        class="cursor-pointer rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-default disabled:opacity-50"
      >
        Create package
      </button>
    </div>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
  </form>
</template>
