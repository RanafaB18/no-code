<script setup lang="ts">
import ThemeToggle from '@/components/ThemeToggle.vue'
</script>

<template>
  <main class="page">
    <div class="toolbar">
      <ThemeToggle />
    </div>

    <section class="card">
      <p>Default text — the primary reading colour.</p>
      <p class="muted">Muted text — secondary information.</p>
      <p class="subtle">Subtle text — captions, hints, metadata.</p>
      <button type="button" class="btn btn--accent">Accent button</button>
      <button type="button" class="btn btn--danger">Danger button</button>
    </section>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 2rem;
  background-color: var(--color-surface);
  color: var(--color-fg-default);
}

.toolbar {
  position: absolute;
  bottom: 1.5rem;
  right: 1.5rem;  
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1.5rem;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding: 1.5rem;
  background-color: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.muted {
  color: var(--color-fg-muted);
}

.subtle {
  color: var(--color-fg-subtle);
}

.btn {
  padding: 0.5rem 1rem;
  font-size: 0.9375rem;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
}

.btn--accent {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
}

.btn--accent:hover {
  background-color: var(--color-accent-hover);
}

.btn--danger {
  color: var(--color-fg-on-danger);
  background-color: var(--color-danger);
}
</style>
