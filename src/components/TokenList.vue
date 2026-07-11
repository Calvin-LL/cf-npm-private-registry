<script setup lang="ts">
import { formatDate, type TokenView } from "@/lib/client";

interface Props {
  tokens: TokenView[];
}

interface Emits {
  revoke: [id: number];
}

defineProps<Props>();
const emit = defineEmits<Emits>();

function permissionLabel(token: TokenView): string {
  if (token.can_read === 1 && token.can_write === 1) return "read + write";
  return token.can_write === 1 ? "write" : "read";
}
</script>

<template>
  <p v-if="tokens.length === 0" class="text-sm text-zinc-500">
    No tokens yet. Generate one to install or publish this package.
  </p>
  <div v-else class="overflow-x-auto">
    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-b border-zinc-200 text-xs text-zinc-500 uppercase">
          <th class="py-2 pr-4 font-medium">Label</th>
          <th class="py-2 pr-4 font-medium">Token</th>
          <th class="py-2 pr-4 font-medium">Access</th>
          <th class="py-2 pr-4 font-medium">Created</th>
          <th class="py-2 pr-4 font-medium">Last used</th>
          <th class="py-2 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="token in tokens"
          :key="token.id"
          class="border-b border-zinc-100"
        >
          <td class="py-2 pr-4">{{ token.label }}</td>
          <td class="py-2 pr-4 font-mono text-xs text-zinc-500">
            {{ token.token_prefix }}...
          </td>
          <td class="py-2 pr-4">
            <span
              class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700"
            >
              {{ permissionLabel(token) }}
            </span>
          </td>
          <td class="py-2 pr-4 text-zinc-500">
            {{ formatDate(token.created_at) }}
          </td>
          <td class="py-2 pr-4 text-zinc-500">
            {{ token.last_used_at ? formatDate(token.last_used_at) : "never" }}
          </td>
          <td class="py-2 text-right">
            <button
              type="button"
              class="cursor-pointer text-xs font-medium text-red-600 hover:text-red-800"
              @click="emit('revoke', token.id)"
            >
              Revoke
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
