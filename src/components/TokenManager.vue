<script setup lang="ts">
import { shallowRef } from "vue";
import TokenCreateForm from "@/components/TokenCreateForm.vue";
import TokenList from "@/components/TokenList.vue";
import { ApiError, apiFetch, type TokenView } from "@/lib/client";

interface Props {
  packageId: number;
  initialTokens: TokenView[];
}

const props = defineProps<Props>();

const tokens = shallowRef<TokenView[]>(props.initialTokens);
const newToken = shallowRef<string | undefined>(undefined);
const error = shallowRef<string | undefined>(undefined);
const copied = shallowRef(false);

function handleCreated(token: string, row: TokenView): void {
  tokens.value = [row, ...tokens.value];
  newToken.value = token;
  copied.value = false;
}

async function handleRevoke(id: number): Promise<void> {
  if (
    !window.confirm(
      "Revoke this token? npm clients using it will stop working.",
    )
  )
    return;
  error.value = undefined;
  try {
    await apiFetch(`/api/tokens/${id}`, { method: "DELETE" });
    tokens.value = tokens.value.filter(function keep(token) {
      return token.id !== id;
    });
  } catch (cause) {
    error.value =
      cause instanceof ApiError ? cause.message : "Something went wrong";
  }
}

async function copyNewToken(): Promise<void> {
  if (!newToken.value) return;
  await navigator.clipboard.writeText(newToken.value);
  copied.value = true;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <TokenCreateForm :package-id="packageId" @created="handleCreated" />
    <div
      v-if="newToken"
      class="flex flex-col gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3"
    >
      <p class="text-sm font-medium text-emerald-900">
        Token created. Copy it now: it will not be shown again.
      </p>
      <div class="flex items-center gap-2">
        <code
          class="rounded bg-white px-2 py-1 font-mono text-xs break-all text-emerald-900"
        >
          {{ newToken }}
        </code>
        <button
          type="button"
          class="shrink-0 cursor-pointer rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-800"
          @click="copyNewToken"
        >
          {{ copied ? "Copied!" : "Copy" }}
        </button>
      </div>
    </div>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <TokenList :tokens="tokens" @revoke="handleRevoke" />
  </div>
</template>
