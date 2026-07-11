<script setup lang="ts">
import { shallowRef } from "vue";
import TokenCreateForm from "@/components/TokenCreateForm.vue";
import TokenList from "@/components/TokenList.vue";
import {
  ApiError,
  apiFetch,
  type PackageOption,
  type TokenView,
} from "@/lib/client";

interface Props {
  packages: PackageOption[];
  initialTokens: TokenView[];
  defaultSelectedIds?: number[];
  onlyPackageId?: number;
}

const props = defineProps<Props>();

const tokens = shallowRef<TokenView[]>(props.initialTokens);
const newToken = shallowRef<string | undefined>(undefined);
const error = shallowRef<string | undefined>(undefined);
const copied = shallowRef(false);

// On a package page the list only shows tokens that grant access to that
// package; a token created without it should not appear there.
function isListed(row: TokenView): boolean {
  if (props.onlyPackageId === undefined) return true;
  const name = props.packages.find(function matches(pkg) {
    return pkg.id === props.onlyPackageId;
  })?.name;
  return name !== undefined && row.packages.includes(name);
}

function handleCreated(token: string, row: TokenView): void {
  if (isListed(row)) {
    tokens.value = [row, ...tokens.value];
  }
  newToken.value = token;
  copied.value = false;
}

async function handleRevoke(id: number): Promise<void> {
  if (
    !window.confirm(
      "Revoke this token? npm clients using it will stop working.",
    )
  ) {
    return;
  }
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
    <TokenCreateForm
      :packages="packages"
      :default-selected-ids="defaultSelectedIds"
      @created="handleCreated"
    />
    <div
      v-if="newToken"
      class="border-success-line bg-success-wash flex flex-col gap-2 rounded-md border p-3"
    >
      <p class="text-success-ink text-sm font-medium">
        Token created. Copy it now: it will not be shown again.
      </p>
      <div class="flex items-center gap-2">
        <code
          class="bg-surface text-success-ink rounded px-2 py-1 font-mono text-xs break-all"
        >
          {{ newToken }}
        </code>
        <button
          type="button"
          class="bg-success-btn hover:bg-success-btn-hover shrink-0 cursor-pointer rounded-md px-3 py-1 text-xs font-medium text-white transition-colors"
          @click="copyNewToken"
        >
          {{ copied ? "Copied!" : "Copy" }}
        </button>
      </div>
    </div>
    <p v-if="error" class="text-danger text-sm">{{ error }}</p>
    <TokenList :tokens="tokens" @revoke="handleRevoke" />
  </div>
</template>
