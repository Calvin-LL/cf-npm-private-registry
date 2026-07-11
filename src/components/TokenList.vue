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

function permissionLabels(token: TokenView): string[] {
  const labels: string[] = [];
  if (token.can_read === 1) labels.push("read");
  if (token.can_write === 1) labels.push("write");
  return labels;
}
</script>

<template>
  <p v-if="tokens.length === 0" class="text-ink-faint text-sm">
    No tokens yet. Generate one to install or publish packages.
  </p>
  <div v-else class="overflow-x-auto">
    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-line text-ink-faint border-b text-xs uppercase">
          <th class="py-2 pr-4 font-medium">Label</th>
          <th class="py-2 pr-4 font-medium">Token</th>
          <th class="py-2 pr-4 font-medium">Access</th>
          <th class="py-2 pr-4 font-medium">Packages</th>
          <th class="py-2 pr-4 font-medium">Created</th>
          <th class="py-2 pr-4 font-medium">Last used</th>
          <th class="py-2 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="token in tokens"
          :key="token.id"
          class="border-line-soft border-b"
        >
          <td class="py-2 pr-4">{{ token.label }}</td>
          <td class="text-ink-faint py-2 pr-4 font-mono text-xs">
            {{ token.token_prefix }}...
          </td>
          <td class="py-2 pr-4">
            <span
              v-for="label in permissionLabels(token)"
              :key="label"
              class="bg-chip text-chip-ink mr-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
            >
              {{ label }}
            </span>
          </td>
          <td class="py-2 pr-4">
            <span
              v-for="name in token.packages"
              :key="name"
              class="bg-chip text-chip-ink mr-1 inline-block rounded-full px-2 py-0.5 font-mono text-xs"
            >
              {{ name }}
            </span>
            <span
              v-if="token.packages.length === 0"
              class="text-ink-faint text-xs"
            >
              none
            </span>
          </td>
          <td class="text-ink-faint py-2 pr-4">
            {{ formatDate(token.created_at) }}
          </td>
          <td class="text-ink-faint py-2 pr-4">
            {{ token.last_used_at ? formatDate(token.last_used_at) : "never" }}
          </td>
          <td class="py-2 text-right">
            <button
              type="button"
              class="text-danger hover:text-danger-strong cursor-pointer text-xs font-medium"
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
